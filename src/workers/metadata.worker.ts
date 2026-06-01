import { FFmpeg } from '@ffmpeg/ffmpeg'
import { parseBlob, type IAudioMetadata } from 'music-metadata'
import type {
    CoverImage,
    MetadataWorkerRequest,
    MetadataWorkerResponse,
    Track,
    TrackFormat,
} from '@/types/audio'
import { loadFFMPEGWasmModule } from '@/lib/utils'

const audioExtensions = new Map<string, TrackFormat>([
    [ 'mp3', 'MP3' ],
    [ 'wav', 'WAV' ],
    [ 'flac', 'FLAC' ],
    [ 'ogg', 'OGG' ],
    [ 'opus', 'OPUS' ],
    [ 'm4a', 'M4A' ],
    [ 'aac', 'AAC' ],
])

const handles = new Map<string, FileSystemFileHandle>()
const trackFormats = new Map<string, TrackFormat>()
const trackDirectories = new Map<string, string>()
const sidecarCovers = new Map<string, FileSystemFileHandle>()
const sidecarCoverCache = new Map<string, CoverImage | null>()
const coverCache = new Map<string, CoverImage | null>()
const artistCache = new Map<string, string | null>()
const artistProbeFailureCounts = new Map<string, number>()
const pendingArtistProbeIds = new Set<string>()
const ffmpeg = new FFmpeg()
const coverMimeType = 'image/jpeg'
const scanChunkSize = 160
const directoryScanConcurrency = 4
const fileReadConcurrency = 8
const coverPreloadConcurrency = 4
const artistProbeConcurrency = 1
let ffmpegLoadPromise: Promise<void> | undefined
let activeScanId = 0

type TaskPriority = 'normal' | 'high'

type ScanDirectoryRequest = Extract<
    MetadataWorkerRequest,
    { type: 'scanDirectory' }
>
type PreloadCoversRequest = Extract<
    MetadataWorkerRequest,
    { type: 'preloadCovers' }
>
type PreloadTrackMetadataRequest = Extract<
    MetadataWorkerRequest,
    { type: 'preloadTrackMetadata' }
>

const sidecarCoverNames = [
    'cover',
    'folder',
    'front',
    'album',
    'artwork',
]

const coverMimeTypes = new Map<string, string>([
    [ 'jpg', 'image/jpeg' ],
    [ 'jpeg', 'image/jpeg' ],
    [ 'png', 'image/png' ],
    [ 'webp', 'image/webp' ],
])

interface ScanCounters
{
    scanned: number
    skipped: number
    directories: number
}

interface ScanState
{
    scanId: number
    counters: ScanCounters
    tracks: Track[]
}

interface AudioFileEntry
{
    fileHandle: FileSystemFileHandle
    format: TrackFormat
    parentPath: string
    relativePath: string
}

interface DirectoryEntry
{
    directoryHandle: FileSystemDirectoryHandle
    relativePath: string
}

class WorkerPool
{
    private activeCount = 0
    private readonly concurrency: number
    private queue: Array<() => void> = []

    constructor(concurrency: number)
    {
        this.concurrency = concurrency
    }

    run<T>(task: () => Promise<T>, priority: TaskPriority = 'normal')
    {
        return new Promise<T>((resolve, reject) =>
        {
            const runTask = () =>
            {
                this.activeCount += 1
                task()
                    .then(resolve, reject)
                    .finally(() =>
                    {
                        this.activeCount -= 1
                        this.drain()
                    })
            }

            if (priority === 'high')
            {
                this.queue.unshift(runTask)
            } else
            {
                this.queue.push(runTask)
            }
            this.drain()
        })
    }

    clear()
    {
        this.queue = []
    }

    private drain()
    {
        while (this.activeCount < this.concurrency)
        {
            const nextTask = this.queue.shift()

            if (!nextTask)
            {
                return
            }

            nextTask()
        }
    }
}

const artistProbePool = new WorkerPool(artistProbeConcurrency)

class FfmpegTaskQueue
{
    private isRunning = false
    private queue: Array<() => void> = []

    run<T>(task: () => Promise<T>, priority: TaskPriority = 'normal')
    {
        return new Promise<T>((resolve, reject) =>
        {
            const runTask = () =>
            {
                this.isRunning = true
                task()
                    .then(resolve, reject)
                    .finally(() =>
                    {
                        this.isRunning = false
                        this.drain()
                    })
            }

            if (priority === 'high')
            {
                this.queue.unshift(runTask)
            } else
            {
                this.queue.push(runTask)
            }

            this.drain()
        })
    }

    clear()
    {
        this.queue = []
    }

    private drain()
    {
        if (this.isRunning)
        {
            return
        }

        const nextTask = this.queue.shift()

        if (nextTask)
        {
            nextTask()
        }
    }
}

const ffmpegTaskQueue = new FfmpegTaskQueue()
const shouldDebugMetadata = import.meta.env.DEV
let ffmpegLogListenerAttached = false

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

async function runPool<T>(
    items: T[],
    concurrency: number,
    task: (item: T) => Promise<void>,
)
{
    let nextIndex = 0
    const workerCount = Math.min(concurrency, items.length)

    await Promise.all(
        Array.from({ length: workerCount }, async () =>
        {
            while (nextIndex < items.length)
            {
                const item = items[ nextIndex ]
                nextIndex += 1

                if (item === undefined)
                {
                    continue
                }

                await task(item)
            }
        }),
    )
}

function supportsMultithreadFfmpeg()
{
    return (
        import.meta.env.PROD &&
        self.crossOriginIsolated &&
        typeof SharedArrayBuffer !== 'undefined'
    )
}

async function resolveFfmpegCoreURLs()
{
    const thread = supportsMultithreadFfmpeg() ? 'multithread' : 'singlethread' as Parameters<typeof loadFFMPEGWasmModule>[ 0 ]
    return loadFFMPEGWasmModule(thread)
}

function post(message: MetadataWorkerResponse, transfer?: Transferable[])
{
    if (transfer && transfer.length > 0)
    {
        self.postMessage(message, { transfer })
        return
    }

    self.postMessage(message)
}

function runFfmpegTask<T>(task: () => Promise<T>, priority: TaskPriority = 'normal')
{
    debugMetadata('ffmpeg task queued', { priority })
    return ffmpegTaskQueue.run(task, priority)
}

function ensureFfmpeg()
{
    if (!ffmpegLoadPromise)
    {
        ffmpegLoadPromise = (async () =>
        {
            const ffmpegCore = await resolveFfmpegCoreURLs()
            debugMetadata('loading ffmpeg core', { mode: ffmpegCore.mode })

            if (shouldDebugMetadata && !ffmpegLogListenerAttached)
            {
                ffmpegLogListenerAttached = true
                ffmpeg.on('log', (log) =>
                {
                    debugMetadata('ffmpeg log', log)
                })
            }

            await ffmpeg.load({
                coreURL: ffmpegCore.coreURL,
                wasmURL: ffmpegCore.wasmURL,
                ...(ffmpegCore.mode === 'multithread'
                    ? { workerURL: ffmpegCore.workerURL }
                    : {}),
            })
        })()
    }

    return ffmpegLoadPromise
}

function getFormat(name: string): TrackFormat | undefined
{
    const extension = name.split('.').pop()?.toLowerCase()
    return extension ? audioExtensions.get(extension) : undefined
}

function getCoverMimeType(name: string)
{
    const extension = name.split('.').pop()?.toLowerCase()
    return extension ? coverMimeTypes.get(extension) : undefined
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

function getSidecarCoverHandle(entries: FileSystemHandle[])
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

function createTrackId(relativePath: string, file: File)
{
    return `${relativePath}:${file.size}:${file.lastModified}`
}

function toSafeFfmpegName(trackId: string, format: TrackFormat)
{
    const safeId = trackId.replace(/[^a-zA-Z0-9_-]/g, '_')
    return `${safeId}.${format.toLowerCase()}`
}

function toSafeFfmpegStem(trackId: string)
{
    return trackId.replace(/[^a-zA-Z0-9_-]/g, '_')
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
        Object.entries(tags).map(([ key, value ]) => [ key.toLowerCase(), value ]),
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
            tags.map((tag) => [ tag.id, tag.value ]),
        )
        const nativeArtist = readTag(nativeTags)

        if (nativeArtist)
        {
            return nativeArtist
        }
    }

    return undefined
}

async function extractArtist(file: File, trackId: string, format: TrackFormat)
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

function scheduleArtistProbe(
    trackId: string,
    fileHandle: FileSystemFileHandle,
    format: TrackFormat,
    scanId: number,
    priority: 'normal' | 'high' = 'normal',
)
{
    const cachedArtist = artistCache.get(trackId)

    if (cachedArtist !== undefined)
    {
        debugMetadata('artist cache hit', {
            trackId,
            artist: cachedArtist,
            cachedNull: cachedArtist === null,
        })

        if (cachedArtist)
        {
            post({
                type: 'trackMetadataLoaded',
                trackId,
                artist: cachedArtist,
            })
        }

        return
    }

    if (pendingArtistProbeIds.has(trackId))
    {
        debugMetadata('artist probe already pending', { trackId })
        return
    }

    pendingArtistProbeIds.add(trackId)
    debugMetadata('artist probe scheduled', { trackId, priority, scanId })

    void artistProbePool.run(async () =>
    {
        if (scanId !== activeScanId)
        {
            debugMetadata('artist probe ignored stale scan before start', {
                trackId,
                scanId,
                activeScanId,
            })
            pendingArtistProbeIds.delete(trackId)
            return
        }

        try
        {
            const file = await fileHandle.getFile()
            const artist = await extractArtist(file, trackId, format)

            if (scanId !== activeScanId)
            {
                debugMetadata('artist probe ignored stale scan after ffprobe', {
                    trackId,
                    scanId,
                    activeScanId,
                })
                return
            }

            artistCache.set(trackId, artist)
            artistProbeFailureCounts.delete(trackId)

            if (!artist)
            {
                debugMetadata('artist probe completed without artist', { trackId })
                return
            }

            debugMetadata('artist probe loaded', { trackId, artist })
            post({
                type: 'trackMetadataLoaded',
                trackId,
                artist,
            })
        } catch (error)
        {
            if (scanId !== activeScanId)
            {
                debugMetadata('artist probe failure ignored stale scan', {
                    trackId,
                    scanId,
                    activeScanId,
                    error: serializeError(error),
                })
                return
            }

            const failureCount = artistProbeFailureCounts.get(trackId) ?? 0
            artistProbeFailureCounts.set(trackId, failureCount + 1)
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
                    if (scanId === activeScanId)
                    {
                        scheduleArtistProbe(trackId, fileHandle, format, scanId, 'high')
                    }
                }, 750)
            }
            // Artist tags are enrichment only; transient FFmpeg failures stay retryable.
        } finally
        {
            pendingArtistProbeIds.delete(trackId)
        }
    }, priority)
}

async function handlePreloadTrackMetadata(message: PreloadTrackMetadataRequest)
{
    debugMetadata('preloadTrackMetadata received', {
        count: message.trackIds.length,
        trackIds: message.trackIds.slice(0, 8),
    })

    for (const trackId of message.trackIds)
    {
        const cachedArtist = artistCache.get(trackId)

        if (cachedArtist !== undefined)
        {
            if (cachedArtist)
            {
                post({
                    type: 'trackMetadataLoaded',
                    trackId,
                    artist: cachedArtist,
                })
            }

            continue
        }

        const fileHandle = handles.get(trackId)
        const format = trackFormats.get(trackId)

        if (!fileHandle || !format)
        {
            debugMetadata('artist probe skipped missing handle/format', {
                trackId,
                hasFileHandle: Boolean(fileHandle),
                format,
            })
            continue
        }

        scheduleArtistProbe(trackId, fileHandle, format, activeScanId, 'high')
    }
}

async function tryExtractCover(inputPath: string, coverPath: string)
{
    try
    {
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
        await ffmpeg.deleteFile(coverPath)

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
        try
        {
            await ffmpeg.deleteFile(coverPath)
        } catch
        {
            // A missing cover output is expected for audio files without embedded art.
        }

        return undefined
    }
}

async function readSidecarCover(directoryPath: string)
{
    const cachedCover = sidecarCoverCache.get(directoryPath)
    if (cachedCover !== undefined)
    {
        return cachedCover
    }

    const coverHandle = sidecarCovers.get(directoryPath)
    if (!coverHandle)
    {
        sidecarCoverCache.set(directoryPath, null)
        return null
    }

    try
    {
        const file = await coverHandle.getFile()
        const mimeType = getCoverMimeType(file.name) ?? file.type

        if (!mimeType)
        {
            sidecarCoverCache.set(directoryPath, null)
            return null
        }

        const data = await file.arrayBuffer()

        if (data.byteLength === 0)
        {
            sidecarCoverCache.set(directoryPath, null)
            return null
        }

        const coverImage = {
            mimeType,
            data,
        } satisfies CoverImage

        sidecarCoverCache.set(directoryPath, coverImage)
        return coverImage
    } catch
    {
        sidecarCoverCache.set(directoryPath, null)
        return null
    }
}

async function preloadCover(trackId: string, scanId: number)
{
    if (scanId !== activeScanId)
    {
        return null
    }

    const cachedCover = coverCache.get(trackId)
    if (cachedCover !== undefined)
    {
        return cachedCover
    }

    const handle = handles.get(trackId)
    if (!handle)
    {
        coverCache.set(trackId, null)
        return null
    }

    const directoryPath = trackDirectories.get(trackId)
    const sidecarCover = directoryPath === undefined
        ? null
        : await readSidecarCover(directoryPath)

    if (scanId !== activeScanId)
    {
        return null
    }

    if (sidecarCover)
    {
        coverCache.set(trackId, sidecarCover)
        return sidecarCover
    }

    const file = await handle.getFile()
    const format = getFormat(file.name)

    if (!format)
    {
        coverCache.set(trackId, null)
        return null
    }

    return runFfmpegTask(async () =>
    {
        if (scanId !== activeScanId)
        {
            return null
        }

        const settledCover = coverCache.get(trackId)
        if (settledCover !== undefined)
        {
            return settledCover
        }

        await ensureFfmpeg()

        const inputPath = toSafeFfmpegName(trackId, format)
        const coverPath = `${toSafeFfmpegStem(trackId)}.jpg`
        const buffer = new Uint8Array(await file.arrayBuffer())

        await ffmpeg.writeFile(inputPath, buffer)

        try
        {
            const coverImage = await tryExtractCover(inputPath, coverPath)

            if (scanId !== activeScanId)
            {
                return null
            }

            coverCache.set(trackId, coverImage ?? null)
            return coverImage ?? null
        } finally
        {
            try
            {
                await ffmpeg.deleteFile(inputPath)
            } catch
            {
                // The temp input may already be gone after a failed ffmpeg run.
            }
        }
    })
}

async function getSortedEntries(directoryHandle: FileSystemDirectoryHandle)
{
    const entries: FileSystemHandle[] = []

    for await (const [ , handle ] of directoryHandle.entries())
    {
        entries.push(handle)
    }

    entries.sort((first, second) =>
        first.name.localeCompare(second.name, undefined, {
            sensitivity: 'base',
        }),
    )

    return entries
}

function flushScanChunk(state: ScanState)
{
    if (state.tracks.length === 0)
    {
        return
    }

    const tracks = state.tracks
    state.tracks = []
    post({ type: 'scanChunk', tracks })
}

async function processAudioFile(entry: AudioFileEntry, state: ScanState)
{
    if (state.scanId !== activeScanId)
    {
        return
    }

    try
    {
        const file = await entry.fileHandle.getFile()

        if (state.scanId !== activeScanId)
        {
            return
        }

        const id = createTrackId(entry.relativePath, file)

        handles.set(id, entry.fileHandle)
        trackFormats.set(id, entry.format)
        trackDirectories.set(id, entry.parentPath)
        state.counters.scanned += 1

        state.tracks.push({
            id,
            name: entry.fileHandle.name.replace(/\.[^.]+$/, ''),
            relativePath: entry.relativePath,
            size: file.size,
            lastModified: file.lastModified,
            format: entry.format,
            fileHandle: entry.fileHandle,
        })

        if (state.tracks.length >= scanChunkSize)
        {
            flushScanChunk(state)
        }

        if (state.counters.scanned % 24 === 0)
        {
            post({
                type: 'scanProgress',
                scanned: state.counters.scanned,
                skipped: state.counters.skipped,
                directories: state.counters.directories,
                currentPath: entry.relativePath,
            })
        }
    } catch
    {
        state.counters.skipped += 1
    }
}

async function scanDirectory(
    directoryHandle: FileSystemDirectoryHandle,
    state: ScanState,
    parentPath = '',
)
{
    if (state.scanId !== activeScanId)
    {
        return
    }

    state.counters.directories += 1
    const entries = await getSortedEntries(directoryHandle)
    const sidecarCover = getSidecarCoverHandle(entries)
    const audioFiles: AudioFileEntry[] = []
    const directories: DirectoryEntry[] = []

    if (sidecarCover)
    {
        sidecarCovers.set(parentPath, sidecarCover)
    }

    for (const handle of entries)
    {
        const relativePath = parentPath ? `${parentPath}/${handle.name}` : handle.name

        if (handle.kind === 'directory')
        {
            directories.push({
                directoryHandle: handle as FileSystemDirectoryHandle,
                relativePath,
            })
            continue
        }

        const fileHandle = handle as FileSystemFileHandle
        const format = getFormat(handle.name)

        if (!format)
        {
            state.counters.skipped += 1
            continue
        }

        audioFiles.push({
            fileHandle,
            format,
            parentPath,
            relativePath,
        })
    }

    await Promise.all([
        runPool(
            audioFiles,
            fileReadConcurrency,
            (entry) => processAudioFile(entry, state),
        ),
        runPool(
            directories,
            directoryScanConcurrency,
            (entry) => scanDirectory(entry.directoryHandle, state, entry.relativePath),
        ),
    ])
}

async function handleScanDirectory(message: ScanDirectoryRequest)
{
    activeScanId += 1
    const scanId = activeScanId
    debugMetadata('scan started', { scanId, directory: message.directoryHandle.name })
    artistProbePool.clear()
    ffmpegTaskQueue.clear()
    handles.clear()
    trackFormats.clear()
    trackDirectories.clear()
    sidecarCovers.clear()
    sidecarCoverCache.clear()
    coverCache.clear()
    artistCache.clear()
    artistProbeFailureCounts.clear()
    pendingArtistProbeIds.clear()

    try
    {
        const state: ScanState = {
            scanId,
            counters: { scanned: 0, skipped: 0, directories: 0 },
            tracks: [],
        }

        await scanDirectory(message.directoryHandle, state)

        if (scanId !== activeScanId)
        {
            return
        }

        flushScanChunk(state)

        post({
            type: 'scanComplete',
            summary: {
                supported: state.counters.scanned,
                skipped: state.counters.skipped,
                directories: state.counters.directories,
            },
        })
        debugMetadata('scan complete', {
            scanId,
            supported: state.counters.scanned,
            skipped: state.counters.skipped,
            directories: state.counters.directories,
        })
    } catch (error)
    {
        post({
            type: 'scanError',
            message:
                error instanceof Error ? error.message : 'Unable to scan this folder',
        })
    }
}

async function handlePreloadCovers(message: PreloadCoversRequest)
{
    const scanId = activeScanId

    await runPool(
        message.trackIds,
        coverPreloadConcurrency,
        async (trackId) =>
        {
            try
            {
                const coverImage = await preloadCover(trackId, scanId)

                if (!coverImage || scanId !== activeScanId)
                {
                    return
                }

                const data = coverImage.data.slice(0)
                post(
                    {
                        type: 'coverLoaded',
                        trackId,
                        coverImage: {
                            mimeType: coverImage.mimeType,
                            data,
                        },
                    },
                    [ data ],
                )
            } catch
            {
                coverCache.set(trackId, null)
            }
        },
    )
}

self.onmessage = (event: MessageEvent<MetadataWorkerRequest>) =>
{
    const message = event.data

    if (message.type === 'scanDirectory')
    {
        void handleScanDirectory(message)
        return
    }

    if (message.type === 'preloadCovers')
    {
        void handlePreloadCovers(message)
        return
    }

    if (message.type === 'preloadTrackMetadata')
    {
        void handlePreloadTrackMetadata(message)
    }
}

export { }
