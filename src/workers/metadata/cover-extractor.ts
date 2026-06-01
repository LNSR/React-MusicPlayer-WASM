import { LRUCache } from 'lru-cache'
import type { FFmpeg } from '@ffmpeg/ffmpeg'
import type {
    CoverImage,
    MetadataWorkerResponse,
    TrackFormat,
} from '@/types/audio'
import {
    FfmpegManager,
    type FfmpegTaskPriority,
} from '../shared/ffmpeg.manager'
import {
    getCoverMimeType,
    getFormat,
    toSafeFfmpegName,
    toSafeFfmpegStem,
} from '../shared/file-system.utils'
import { runConcurrent } from '../shared/concurrency.utils'
import {
    isAbortError,
    type WorkerSessionView,
} from '../shared/worker-runtime'

const sidecarCoverNames = [
    'cover',
    'folder',
    'front',
    'album',
    'artwork',
]
const noCover = { status: 'missing-cover' } as const
const coverMimeType = 'image/jpeg'
const coverPreloadConcurrency = 8

type CoverCacheValue = CoverImage | typeof noCover

interface CoverExtractorOptions
{
    ffmpegManager: FfmpegManager
    handles: Map<string, FileSystemFileHandle>
    post: (
        message: MetadataWorkerResponse,
        transfer?: Transferable[],
    ) => void
    sidecarCovers: Map<string, FileSystemFileHandle>
    trackDirectories: Map<string, string>
    trackFormats: Map<string, TrackFormat>
}

function getCoverCacheSize(coverImage: CoverCacheValue): number
{
    return 'data' in coverImage ? coverImage.data.byteLength : 1
}

function getSidecarCoverRank(name: string)
{
    if (!getCoverMimeType(name))
    {
        return undefined
    }

    const stem = name.replace(/\.[^.]+$/, '').toLowerCase()
    const rank = sidecarCoverNames.indexOf(stem)
    return rank === -1 ? undefined : rank
}

function readCoverCacheValue(coverImage: CoverCacheValue): CoverImage | null
{
    return 'data' in coverImage ? coverImage : null
}

export function findSidecarCoverHandle(entries: FileSystemHandle[])
{
    let bestRank = Number.POSITIVE_INFINITY
    let bestHandle: FileSystemFileHandle | undefined

    for (const handle of entries)
    {
        if (handle.kind !== 'file')
        {
            continue
        }

        const rank = getSidecarCoverRank(handle.name)

        if (rank === undefined || rank >= bestRank)
        {
            continue
        }

        bestRank = rank
        bestHandle = handle as FileSystemFileHandle
    }

    return bestHandle
}

export class CoverExtractor
{
    private readonly coverCache = new LRUCache<string, CoverCacheValue>({
        maxSize: 80 * 1024 * 1024,
        sizeCalculation: getCoverCacheSize,
    })
    private readonly options: CoverExtractorOptions
    private readonly sidecarCoverCache = new LRUCache<string, CoverCacheValue>({
        maxSize: 32 * 1024 * 1024,
        sizeCalculation: getCoverCacheSize,
    })

    constructor(options: CoverExtractorOptions)
    {
        this.options = options
    }

    clear()
    {
        this.sidecarCoverCache.clear()
        this.coverCache.clear()
    }

    async preloadCovers(trackIds: string[], session: WorkerSessionView | undefined)
    {
        if (!session?.isCurrent())
        {
            return
        }

        await runConcurrent(
            trackIds,
            coverPreloadConcurrency,
            async (trackId) =>
            {
                try
                {
                    const coverImage = await this.preloadCover(trackId, session)

                    if (!coverImage || !session.isCurrent())
                    {
                        return
                    }

                    const data = coverImage.data.slice(0)
                    this.options.post(
                        {
                            type: 'coverLoaded',
                            trackId,
                            coverImage: {
                                mimeType: coverImage.mimeType,
                                data,
                            },
                        },
                        [data],
                    )
                } catch (error)
                {
                    if (isAbortError(error))
                    {
                        return
                    }

                    this.coverCache.set(trackId, noCover)
                }
            },
        )
    }

    private async preloadCover(
        trackId: string,
        session: WorkerSessionView,
    ): Promise<CoverImage | null>
    {
        session.throwIfAborted()

        const cachedCover = this.coverCache.get(trackId)
        if (cachedCover !== undefined)
        {
            return readCoverCacheValue(cachedCover)
        }

        const handle = this.options.handles.get(trackId)
        if (!handle)
        {
            this.coverCache.set(trackId, noCover)
            return null
        }

        session.throwIfAborted()
        const directoryPath = this.options.trackDirectories.get(trackId)
        const sidecarCover = directoryPath === undefined
            ? null
            : await this.readSidecarCover(directoryPath)

        session.throwIfAborted()

        if (sidecarCover)
        {
            this.coverCache.set(trackId, sidecarCover)
            return sidecarCover
        }

        const file = await handle.getFile()
        session.throwIfAborted()
        const format = this.options.trackFormats.get(trackId) ?? getFormat(file.name)

        if (!format)
        {
            this.coverCache.set(trackId, noCover)
            return null
        }

        return await this.extractEmbeddedCover({
            file,
            format,
            priority: 'normal',
            session,
            trackId,
        })
    }

    private async extractEmbeddedCover({
        file,
        format,
        priority,
        session,
        trackId,
    }: {
        file: File
        format: TrackFormat
        priority: FfmpegTaskPriority
        session: WorkerSessionView
        trackId: string
    })
    {
        return await this.options.ffmpegManager.run(async (ffmpeg) =>
        {
            session.throwIfAborted()

            const settledCover = this.coverCache.get(trackId)
            if (settledCover !== undefined)
            {
                return readCoverCacheValue(settledCover)
            }

            const inputPath = toSafeFfmpegName(trackId, format)
            const coverPath = `${toSafeFfmpegStem(trackId)}.jpg`
            const buffer = new Uint8Array(await file.arrayBuffer())

            session.throwIfAborted()
            await using inputFile = this.options.ffmpegManager.tempFile(inputPath)
            void inputFile
            await ffmpeg.writeFile(inputPath, buffer)

            const coverImage = await this.tryExtractCover(
                ffmpeg,
                inputPath,
                coverPath,
            )

            session.throwIfAborted()

            this.coverCache.set(trackId, coverImage ?? noCover)
            return coverImage ?? null
        }, priority)
    }

    private async readSidecarCover(directoryPath: string): Promise<CoverImage | null>
    {
        const cachedCover = this.sidecarCoverCache.get(directoryPath)
        if (cachedCover !== undefined)
        {
            return readCoverCacheValue(cachedCover)
        }

        const coverHandle = this.options.sidecarCovers.get(directoryPath)
        if (!coverHandle)
        {
            this.sidecarCoverCache.set(directoryPath, noCover)
            return null
        }

        try
        {
            const file = await coverHandle.getFile()
            const mimeType = getCoverMimeType(file.name) ?? file.type

            if (!mimeType)
            {
                this.sidecarCoverCache.set(directoryPath, noCover)
                return null
            }

            const data = await file.arrayBuffer()

            if (data.byteLength === 0)
            {
                this.sidecarCoverCache.set(directoryPath, noCover)
                return null
            }

            const coverImage = {
                mimeType,
                data,
            } satisfies CoverImage

            this.sidecarCoverCache.set(directoryPath, coverImage)
            return coverImage
        } catch
        {
            this.sidecarCoverCache.set(directoryPath, noCover)
            return null
        }
    }

    private async tryExtractCover(
        ffmpeg: FFmpeg,
        inputPath: string,
        coverPath: string,
    )
    {
        try
        {
            await using coverFile = this.options.ffmpegManager.tempFile(coverPath)
            void coverFile
            await ffmpeg.exec([
                '-i',
                inputPath,
                '-map',
                '0:v:0?',
                '-frames:v',
                '1',
                '-vf',
                'scale=512:-1',
                '-update',
                '1',
                coverPath,
            ])

            const cover = await ffmpeg.readFile(coverPath)

            if (typeof cover === 'string' || cover.byteLength === 0)
            {
                return undefined
            }

            return {
                mimeType: coverMimeType,
                data: cover.slice().buffer as ArrayBuffer,
            } satisfies CoverImage
        } catch
        {
            return undefined
        }
    }
}
