import * as Comlink from 'comlink'
import type {
    MetadataWorkerApi,
    MetadataWorkerResponse,
    TrackFormat,
    WorkerMessageHandler,
} from '@/types/audio'
import { FfmpegManager } from '../shared/ffmpeg.manager'
import {
    WorkerSession,
    isAbortError,
} from '../shared/worker-runtime'
import { ArtistExtractor } from './artist-extractor'
import { CoverExtractor, findSidecarCoverHandle } from './cover-extractor'
import { DirectoryScanner } from './directory-scanner'

const shouldDebugMetadata = import.meta.env.DEV

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

class MetadataWorkerApp implements MetadataWorkerApi
{
    private readonly handles = new Map<string, FileSystemFileHandle>()
    private messageHandler:
        | WorkerMessageHandler<MetadataWorkerResponse>
        | undefined
    private readonly session = new WorkerSession()
    private readonly sidecarCovers = new Map<string, FileSystemFileHandle>()
    private readonly trackDirectories = new Map<string, string>()
    private readonly trackFormats = new Map<string, TrackFormat>()

    private readonly ffmpegManager = new FfmpegManager({
        debug: shouldDebugMetadata,
        onLog: (log) =>
        {
            if (shouldDebugMetadata)
            {
                debugMetadata('ffmpeg log', log)
            }
        },
    })

    private readonly artistExtractor = new ArtistExtractor({
        handles: this.handles,
        post: (message) => this.post(message),
        trackFormats: this.trackFormats,
    })

    private readonly coverExtractor = new CoverExtractor({
        ffmpegManager: this.ffmpegManager,
        handles: this.handles,
        post: (message, transfer) => this.post(message, transfer),
        sidecarCovers: this.sidecarCovers,
        trackDirectories: this.trackDirectories,
        trackFormats: this.trackFormats,
    })

    private readonly directoryScanner = new DirectoryScanner({
        handles: this.handles,
        onSidecarCover: (directoryPath, handle) =>
        {
            this.sidecarCovers.set(directoryPath, handle)
        },
        post: (message) => this.post(message),
        sidecarCoverResolver: findSidecarCoverHandle,
        trackDirectories: this.trackDirectories,
        trackFormats: this.trackFormats,
    })
    constructor()
    {
        this.session.onReset(() =>
        {
            this.clearScanState()
        })
    }

    setMessageHandler(
        handler: WorkerMessageHandler<MetadataWorkerResponse> | undefined,
    )
    {
        this.messageHandler = handler
    }

    private clearScanState()
    {
        this.ffmpegManager.clearQueuedTasks()
        this.handles.clear()
        this.trackFormats.clear()
        this.trackDirectories.clear()
        this.sidecarCovers.clear()
        this.coverExtractor.clear()
        this.artistExtractor.clear()
    }

    async preloadCovers(trackIds: string[])
    {
        await this.coverExtractor.preloadCovers(
            trackIds,
            this.session.current(),
        )
    }

    preloadTrackMetadata(trackIds: string[])
    {
        this.artistExtractor.preloadTrackMetadata(
            trackIds,
            this.session.current(),
        )
    }

    async scanDirectory(directoryHandle: FileSystemDirectoryHandle)
    {
        const scanSession = this.session.start('scanDirectory')
        debugMetadata('scan started', {
            sessionId: scanSession.id,
            directory: directoryHandle.name,
        })

        try
        {
            const counters = await this.directoryScanner.scan(
                directoryHandle,
                scanSession,
            )

            if (!counters || !scanSession.isCurrent())
            {
                return
            }

            this.post({
                type: 'scanComplete',
                summary: {
                    supported: counters.scanned,
                    skipped: counters.skipped,
                    directories: counters.directories,
                },
            })
            debugMetadata('scan complete', {
                sessionId: scanSession.id,
                supported: counters.scanned,
                skipped: counters.skipped,
                directories: counters.directories,
            })
        } catch (error)
        {
            if (isAbortError(error))
            {
                return
            }

            this.post({
                type: 'scanError',
                message:
                    error instanceof Error ? error.message : 'Unable to scan this folder',
            })
        }
    }

    private post(message: MetadataWorkerResponse, transfer?: Transferable[])
    {
        if (!this.messageHandler)
        {
            return
        }

        if (transfer && transfer.length > 0)
        {
            void this.messageHandler(Comlink.transfer(message, transfer))
            return
        }

        void this.messageHandler(message)
    }
}

Comlink.expose(new MetadataWorkerApp())

export { }
