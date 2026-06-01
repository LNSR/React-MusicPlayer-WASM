import { useEffect } from 'react'
import { toast } from 'sonner'
import { useShallow } from 'zustand/react/shallow'
import { useMusicAppStore } from '@/stores/useMusicAppStore'
import type {
  AudioRuntime,
  DecodeWorkerResponse,
  MetadataWorkerResponse,
  PendingAutoplayRef,
  PostToMetadataWorker,
  Track,
  WorkerRef,
} from '@/types/audio'

interface UseLibraryWorkerOptions {
  applyCoverImage: (
    trackId: string,
    coverImage?: { mimeType: string; data: ArrayBuffer },
  ) => string | undefined
  closeAudioRuntime: () => void
  ensureAudioRuntime: () => Promise<AudioRuntime>
  decodeWorkerRef: WorkerRef
  metadataWorkerRef: WorkerRef
  pendingAutoplayRef: PendingAutoplayRef
  postToMetadataWorker: PostToMetadataWorker
  revokeAllCoverUrls: () => void
}

export function useLibraryWorker({
  applyCoverImage,
  closeAudioRuntime,
  ensureAudioRuntime,
  decodeWorkerRef,
  metadataWorkerRef,
  pendingAutoplayRef,
  postToMetadataWorker,
  revokeAllCoverUrls,
}: UseLibraryWorkerOptions) {
  const {
    appendScanResults,
    completeScanResults,
    patchTrack,
    setScanProgress,
    updatePlayer,
    updateScanSummary,
  } = useMusicAppStore(
    useShallow((state) => ({
      appendScanResults: state.appendScanResults,
      completeScanResults: state.completeScanResults,
      patchTrack: state.patchTrack,
      setScanProgress: state.setScanProgress,
      updatePlayer: state.updatePlayer,
      updateScanSummary: state.updateScanSummary,
    })),
  )

  useEffect(() => {
    const metadataWorker = new Worker(
      new URL('../../workers/metadata.worker.ts', import.meta.url),
      { type: 'module' },
    )
    const decodeWorker = new Worker(
      new URL('../../workers/audio-decode.worker.ts', import.meta.url),
      { type: 'module' },
    )
    metadataWorkerRef.current = metadataWorker
    decodeWorkerRef.current = decodeWorker
    let scanChunkBuffer: Track[] = []
    let scanChunkFrame = 0
    const pendingArtistByTrackId = new Map<string, string>()

    function flushScanChunkBuffer() {
      if (!scanChunkBuffer.length) {
        scanChunkFrame = 0
        return
      }

      const tracks = scanChunkBuffer.map((track) => {
        const pendingArtist = pendingArtistByTrackId.get(track.id)

        if (!pendingArtist) {
          return track
        }

        pendingArtistByTrackId.delete(track.id)
        return { ...track, artist: pendingArtist }
      })
      scanChunkBuffer = []
      scanChunkFrame = 0
      appendScanResults(tracks)
    }

    function scheduleScanChunkFlush() {
      if (scanChunkFrame !== 0) {
        return
      }

      scanChunkFrame = window.requestAnimationFrame(() => {
        flushScanChunkBuffer()
      })
    }

    function handleCoverLoaded(
      message: Extract<MetadataWorkerResponse, { type: 'coverLoaded' }>,
    ) {
      const coverUrl = applyCoverImage(message.trackId, message.coverImage)

      if (!coverUrl) {
        return
      }

      patchTrack(message.trackId, { coverUrl })
    }

    function applyTrackArtist(trackId: string, artist: string) {
      const trackExists = useMusicAppStore
        .getState()
        .tracks.some((track) => track.id === trackId)

      if (!trackExists) {
        pendingArtistByTrackId.set(trackId, artist)
        return
      }

      patchTrack(trackId, { artist })
    }

    function handleDecodeProgress(
      message: Extract<DecodeWorkerResponse, { type: 'decodeProgress' }>,
    ) {
      const activeTrackId = useMusicAppStore.getState().player.currentTrackId

      if (message.trackId && message.trackId !== activeTrackId) {
        return
      }

      setScanProgress(message.message)
    }

    async function startAutoplay(runtime: AudioRuntime, trackId: string) {
      if (!pendingAutoplayRef.current) {
        return
      }

      if (useMusicAppStore.getState().player.currentTrackId !== trackId) {
        return
      }

      await runtime.context.resume()

      if (useMusicAppStore.getState().player.currentTrackId !== trackId) {
        return
      }

      runtime.node.port.postMessage({ type: 'play' })
    }

    const handleMetadataWorkerMessage = async (
      event: MessageEvent<MetadataWorkerResponse>,
    ) => {
      const message = event.data

      if (message.type === 'scanProgress') {
        updateScanSummary({
          supported: message.scanned,
          skipped: message.skipped,
          directories: message.directories,
        })
        setScanProgress(
          `${message.scanned} tracks found, ${message.skipped} skipped. ${message.currentPath}`,
        )
        return
      }

      if (message.type === 'scanChunk') {
        scanChunkBuffer.push(...message.tracks)
        scheduleScanChunkFlush()
        return
      }

      if (message.type === 'scanComplete') {
        if (scanChunkFrame !== 0) {
          window.cancelAnimationFrame(scanChunkFrame)
        }
        flushScanChunkBuffer()
        const queueIds = completeScanResults(message.summary)

        const preloadTrackIds = queueIds.slice(0, 12)
        if (preloadTrackIds.length > 0) {
          postToMetadataWorker({ type: 'preloadCovers', trackIds: preloadTrackIds })
          postToMetadataWorker({
            type: 'preloadTrackMetadata',
            trackIds: preloadTrackIds,
          })
        }

        toast.success(`Scanned ${message.summary.supported} playable tracks`)
        return
      }

      if (message.type === 'scanError') {
        setScanProgress('')
        toast.error(message.message)
        return
      }

      if (message.type === 'trackMetadataLoaded') {
        if (import.meta.env.DEV) {
          console.debug('[useLibraryWorker] trackMetadataLoaded', {
            trackId: message.trackId,
            artist: message.artist,
          })
        }

        if (message.artist) {
          applyTrackArtist(message.trackId, message.artist)
        }
        return
      }

      if (message.type === 'coverLoaded') {
        handleCoverLoaded(message)
        return
      }

      return undefined
    }

    const handleDecodeWorkerMessage = async (
      event: MessageEvent<DecodeWorkerResponse>,
    ) => {
      const message = event.data

      if (message.type === 'decodeProgress') {
        handleDecodeProgress(message)
        return
      }

      if (message.type === 'decodedTrack') {
        try {
          const coverUrl = applyCoverImage(message.trackId, message.coverImage)
          patchTrack(message.trackId, {
            duration: message.duration,
            sampleRate: message.sampleRate,
            channelCount: message.channelCount,
            coverUrl,
          })

          if (useMusicAppStore.getState().player.currentTrackId !== message.trackId) {
            return
          }

          const runtime = await ensureAudioRuntime()

          if (useMusicAppStore.getState().player.currentTrackId !== message.trackId) {
            return
          }

          runtime.node.port.postMessage(
            {
              type: 'loadPcm',
              trackId: message.trackId,
              sampleRate: message.sampleRate,
              duration: message.duration,
              channelData: message.channelData,
            },
            message.channelData.map((channel) => channel.buffer),
          )
          runtime.node.port.postMessage({
            type: 'setVolume',
            volume: useMusicAppStore.getState().player.volume,
          })
          updatePlayer((state) => {
            if (state.currentTrackId !== message.trackId) {
              return state
            }

            return {
              ...state,
              status: pendingAutoplayRef.current ? 'playing' : 'ready',
              duration: message.duration,
              position: 0,
              bufferedRanges: [[0, message.duration]],
            }
          })
          setScanProgress('')
          await startAutoplay(runtime, message.trackId)
        } catch (error) {
          const detail =
            error instanceof Error ? error.message : 'Browser decode failed'
          updatePlayer((state) => ({
            ...state,
            status: 'error',
            error: detail,
          }))
          toast.error('Unable to prepare decoded PCM audio')
        }
        return
      }

      if (message.type === 'decodeError') {
        const activeTrackId = useMusicAppStore.getState().player.currentTrackId

        if (message.trackId && message.trackId !== activeTrackId) {
          return
        }

        updatePlayer((state) => ({
          ...state,
          status: 'error',
          error: message.message,
        }))
        toast.error(message.message)
      }
    }

    metadataWorker.addEventListener('message', handleMetadataWorkerMessage)
    decodeWorker.addEventListener('message', handleDecodeWorkerMessage)

    return () => {
      if (scanChunkFrame !== 0) {
        window.cancelAnimationFrame(scanChunkFrame)
      }
      metadataWorker.removeEventListener('message', handleMetadataWorkerMessage)
      decodeWorker.removeEventListener('message', handleDecodeWorkerMessage)
      metadataWorker.terminate()
      decodeWorker.terminate()
      if (metadataWorkerRef.current === metadataWorker) {
        metadataWorkerRef.current = null
      }
      if (decodeWorkerRef.current === decodeWorker) {
        decodeWorkerRef.current = null
      }
      closeAudioRuntime()
      revokeAllCoverUrls()
    }
  }, [
    appendScanResults,
    applyCoverImage,
    closeAudioRuntime,
    completeScanResults,
    decodeWorkerRef,
    ensureAudioRuntime,
    metadataWorkerRef,
    patchTrack,
    pendingAutoplayRef,
    postToMetadataWorker,
    revokeAllCoverUrls,
    setScanProgress,
    updatePlayer,
    updateScanSummary,
  ])
}
