import { LRUCache } from 'lru-cache'
import { parseBlob, type IAudioMetadata } from 'music-metadata'
import type {
    MetadataWorkerResponse,
    TrackFormat,
} from '@/types/audio'
import {
    PriorityTaskPool,
    type TaskPriority,
} from '../shared/concurrency.utils'
import {
    isAbortError,
    type WorkerSessionView,
} from '../shared/worker-runtime'

const noArtist = Symbol('missing-artist')
const artistProbeConcurrency = 8
const shouldDebugMetadata = import.meta.env.DEV

type ArtistCacheValue = string | typeof noArtist

interface ArtistExtractorOptions
{
    handles: Map<string, FileSystemFileHandle>
    post: (message: MetadataWorkerResponse) => void
    trackFormats: Map<string, TrackFormat>
}

function debugMetadata(message: string, detail?: unknown)
{
    if (!shouldDebugMetadata)
    {
        return
    }

    if (detail === undefined)
    {
        console.debug(`[metadata.worker] ${message}`)
        return
    }

    console.debug(`[metadata.worker] ${message}`, detail)
}

function serializeError(error: unknown)
{
    if (error instanceof Error)
    {
        return {
            name: error.name,
            message: error.message,
            stack: error.stack,
        }
    }

    return error
}

function normalizeTag(value: unknown): string | undefined
{
    if (Array.isArray(value))
    {
        return value
            .map((item) => normalizeTag(item))
            .filter((item): item is string => Boolean(item))
            .join(', ') || undefined
    }

    if (typeof value !== 'string')
    {
        return undefined
    }

    const trimmedValue = value.trim()
    return trimmedValue ? trimmedValue : undefined
}

function readTag(tags: Record<string, unknown> | undefined)
{
    if (!tags)
    {
        return undefined
    }

    const normalizedTags = new Map(
        Object.entries(tags).map(([key, value]) => [key.toLowerCase(), value]),
    )
    const tagNames = [
        'artist',
        'artists',
        'album_artist',
        'albumartist',
        'album artist',
        'performer',
    ]

    for (const tagName of tagNames)
    {
        const tag = normalizeTag(normalizedTags.get(tagName))

        if (tag)
        {
            return tag
        }
    }

    return undefined
}

function readCommonArtist(metadata: IAudioMetadata)
{
    const common = metadata.common
    const commonArtist =
        normalizeTag(common.artist) ??
        normalizeTag(common.artists) ??
        normalizeTag(common.albumartist) ??
        normalizeTag(common.albumartists)

    if (commonArtist)
    {
        return commonArtist
    }

    for (const tags of Object.values(metadata.native))
    {
        const nativeTags = Object.fromEntries(
            tags.map((tag) => [tag.id, tag.value]),
        )
        const nativeArtist = readTag(nativeTags)

        if (nativeArtist)
        {
            return nativeArtist
        }
    }

    return undefined
}

export class ArtistExtractor
{
    private readonly artistCache = new LRUCache<string, ArtistCacheValue>({
        max: 20_000,
    })
    private readonly failureCounts = new Map<string, number>()
    private readonly options: ArtistExtractorOptions
    private readonly pendingIds = new Set<string>()
    private readonly taskPool = new PriorityTaskPool(artistProbeConcurrency)

    constructor(options: ArtistExtractorOptions)
    {
        this.options = options
    }

    clear()
    {
        this.taskPool.clear()
        this.artistCache.clear()
        this.failureCounts.clear()
        this.pendingIds.clear()
    }

    preloadTrackMetadata(trackIds: string[], session: WorkerSessionView | undefined)
    {
        if (!session?.isCurrent())
        {
            return
        }

        debugMetadata('preloadTrackMetadata received', {
            count: trackIds.length,
            trackIds: trackIds.slice(0, 8),
        })

        for (const trackId of trackIds)
        {
            const cachedArtist = this.artistCache.get(trackId)

            if (cachedArtist !== undefined)
            {
                this.postCachedArtist(trackId, cachedArtist, session)
                continue
            }

            const fileHandle = this.options.handles.get(trackId)
            const format = this.options.trackFormats.get(trackId)

            if (!fileHandle || !format)
            {
                debugMetadata('artist probe skipped missing handle/format', {
                    trackId,
                    hasFileHandle: Boolean(fileHandle),
                    format,
                })
                continue
            }

            this.scheduleProbe(
                trackId,
                fileHandle,
                format,
                session,
                'high',
            )
        }
    }

    private async extractArtist(
        file: File,
        trackId: string,
        format: TrackFormat,
    )
    {
        debugMetadata('artist metadata parse start', {
            trackId,
            name: file.name,
            format,
            size: file.size,
        })

        const metadata = await parseBlob(file, {
            duration: false,
            skipCovers: true,
            skipPostHeaders: true,
        })
        const artist = readCommonArtist(metadata) ?? null

        debugMetadata('artist metadata parsed', {
            trackId,
            name: file.name,
            artist,
            codec: metadata.format.codec,
            container: metadata.format.container,
            tagTypes: metadata.format.tagTypes,
            nativeTagTypes: Object.keys(metadata.native),
        })

        return artist
    }

    private handleProbeError({
        error,
        fileHandle,
        format,
        session,
        trackId,
    }: {
        error: unknown
        fileHandle: FileSystemFileHandle
        format: TrackFormat
        session: WorkerSessionView
        trackId: string
    })
    {
        if (!session.isCurrent())
        {
            debugMetadata('artist probe failure ignored stale scan', {
                trackId,
                sessionId: session.id,
                error: serializeError(error),
            })
            return
        }

        const failureCount = this.failureCounts.get(trackId) ?? 0
        this.failureCounts.set(trackId, failureCount + 1)
        debugMetadata('artist probe failed', {
            trackId,
            failureCount: failureCount + 1,
            willRetry: failureCount < 2,
            error: serializeError(error),
        })

        if (failureCount < 2)
        {
            self.setTimeout(() =>
            {
                if (session.isCurrent())
                {
                    this.scheduleProbe(trackId, fileHandle, format, session, 'high')
                }
            }, 750)
            return
        }

        this.options.post({
            type: 'trackMetadataFailed',
            trackId,
            message:
                error instanceof Error
                    ? error.message
                    : 'Unable to read artist metadata',
        })
    }

    private postCachedArtist(
        trackId: string,
        cachedArtist: ArtistCacheValue,
        session: WorkerSessionView,
    )
    {
        if (!session.isCurrent())
        {
            return
        }

        this.options.post({
            type: 'trackMetadataLoaded',
            trackId,
            artist: cachedArtist === noArtist ? null : cachedArtist,
        })
    }

    private scheduleProbe(
        trackId: string,
        fileHandle: FileSystemFileHandle,
        format: TrackFormat,
        session: WorkerSessionView,
        priority: TaskPriority = 'normal',
    )
    {
        if (!session.isCurrent())
        {
            return
        }

        const cachedArtist = this.artistCache.get(trackId)

        if (cachedArtist !== undefined)
        {
            debugMetadata('artist cache hit', {
                trackId,
                artist: cachedArtist,
                cachedNull: cachedArtist === noArtist,
            })
            this.postCachedArtist(trackId, cachedArtist, session)
            return
        }

        if (this.pendingIds.has(trackId))
        {
            debugMetadata('artist probe already pending', { trackId })
            return
        }

        this.pendingIds.add(trackId)
        debugMetadata('artist probe scheduled', {
            trackId,
            priority,
            sessionId: session.id,
        })

        void this.taskPool.run(async () =>
        {
            if (!session.isCurrent())
            {
                debugMetadata('artist probe ignored stale scan before start', {
                    trackId,
                    sessionId: session.id,
                })
                this.pendingIds.delete(trackId)
                return
            }

            try
            {
                session.throwIfAborted()
                const file = await fileHandle.getFile()
                session.throwIfAborted()
                const artist = await this.extractArtist(file, trackId, format)

                if (!session.isCurrent())
                {
                    debugMetadata('artist probe ignored stale scan after ffprobe', {
                        trackId,
                        sessionId: session.id,
                    })
                    return
                }

                this.artistCache.set(trackId, artist ?? noArtist)
                this.failureCounts.delete(trackId)

                if (!artist)
                {
                    debugMetadata('artist probe completed without artist', { trackId })
                    this.options.post({
                        type: 'trackMetadataLoaded',
                        trackId,
                        artist: null,
                    })
                    return
                }

                debugMetadata('artist probe loaded', { trackId, artist })
                this.options.post({
                    type: 'trackMetadataLoaded',
                    trackId,
                    artist,
                })
            } catch (error)
            {
                if (isAbortError(error))
                {
                    return
                }

                this.handleProbeError({
                    error,
                    fileHandle,
                    format,
                    session,
                    trackId,
                })
            } finally
            {
                this.pendingIds.delete(trackId)
            }
        }, priority)
    }
}
