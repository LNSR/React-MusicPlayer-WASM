import type { MetadataWorkerResponse, Track, TrackFormat } from '@/types/audio'
import {
    createTrackId,
    getFormat,
    getSortedEntries,
} from '../shared/file-system.utils'
import { runConcurrent } from '../shared/concurrency.utils'
import {
    ProgressReporter,
    isAbortError,
    type WorkerSessionView,
} from '../shared/worker-runtime'

const scanChunkSize = 160
const directoryScanConcurrency = 8
const fileReadConcurrency = 8
type ScanProgressMessage = Extract<
    MetadataWorkerResponse,
    { type: 'scanProgress' }
>

export interface ScanCounters
{
    scanned: number
    skipped: number
    directories: number
}

export interface ScanState
{
    counters: ScanCounters
    progress: ProgressReporter<ScanProgressMessage>
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

interface DirectoryScannerOptions
{
    handles: Map<string, FileSystemFileHandle>
    onSidecarCover: (
        directoryPath: string,
        handle: FileSystemFileHandle,
    ) => void
    post: (message: MetadataWorkerResponse) => void
    sidecarCoverResolver: (
        entries: FileSystemHandle[],
    ) => FileSystemFileHandle | undefined
    trackDirectories: Map<string, string>
    trackFormats: Map<string, TrackFormat>
}

export class DirectoryScanner
{
    private readonly options: DirectoryScannerOptions

    constructor(options: DirectoryScannerOptions)
    {
        this.options = options
    }

    async scan(
        directoryHandle: FileSystemDirectoryHandle,
        session: WorkerSessionView,
    )
    {
        const counters = { scanned: 0, skipped: 0, directories: 0 }
        const state: ScanState = {
            counters,
            progress: new ProgressReporter({
                getSnapshot: (currentPath) => ({
                    type: 'scanProgress',
                    scanned: counters.scanned,
                    skipped: counters.skipped,
                    directories: counters.directories,
                    currentPath,
                }),
                post: (message) => this.options.post(message),
                signal: session.signal,
            }),
            tracks: [],
        }
        using progress = state.progress

        await this.scanDirectory(directoryHandle, state, session)
        session.throwIfAborted()
        progress.flush()
        this.flushScanChunk(state, session)

        return state.counters
    }

    private flushScanChunk(state: ScanState, session: WorkerSessionView)
    {
        session.throwIfAborted()

        if (state.tracks.length === 0)
        {
            return
        }

        const tracks = state.tracks
        state.tracks = []
        this.options.post({ type: 'scanChunk', tracks })
    }

    private async processAudioFile(
        entry: AudioFileEntry,
        state: ScanState,
        session: WorkerSessionView,
    )
    {
        try
        {
            session.throwIfAborted()
            const file = await entry.fileHandle.getFile()
            session.throwIfAborted()

            const id = createTrackId(entry.relativePath, file)

            this.options.handles.set(id, entry.fileHandle)
            this.options.trackFormats.set(id, entry.format)
            this.options.trackDirectories.set(id, entry.parentPath)
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
                this.flushScanChunk(state, session)
            }

            state.progress.mark(entry.relativePath)
        } catch (error)
        {
            if (isAbortError(error))
            {
                return
            }

            state.counters.skipped += 1
        }
    }

    private async scanDirectory(
        directoryHandle: FileSystemDirectoryHandle,
        state: ScanState,
        session: WorkerSessionView,
        parentPath = '',
    )
    {
        session.throwIfAborted()
        state.counters.directories += 1
        const entries = await getSortedEntries(directoryHandle)
        session.throwIfAborted()
        const sidecarCover = this.options.sidecarCoverResolver(entries)
        const audioFiles: AudioFileEntry[] = []
        const directories: DirectoryEntry[] = []

        if (sidecarCover)
        {
            this.options.onSidecarCover(parentPath, sidecarCover)
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
            runConcurrent(
                audioFiles,
                fileReadConcurrency,
                (entry) => this.processAudioFile(entry, state, session),
            ),
            runConcurrent(
                directories,
                directoryScanConcurrency,
                (entry) =>
                    this.scanDirectory(
                        entry.directoryHandle,
                        state,
                        session,
                        entry.relativePath,
                    ),
            ),
        ])
    }
}
