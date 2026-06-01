import { useEffect } from 'react'
import * as Comlink from 'comlink'
import { toast } from 'sonner'
import { useShallow } from 'zustand/react/shallow'
import { useMusicAppStore } from '@/stores/useMusicAppStore'
import type {
  AudioRuntime,
  DecodeWorkerApi,
  DecodeWorkerResponse,
  DecodeWorkerRef,
  MetadataWorkerApi,
  MetadataWorkerResponse,
  MetadataWorkerRef,
  PendingAutoplayRef,
  PostToMetadataWorker,
  Track,
} from '@/types/audio'

interface UseLibraryWorkerOptions
{
  applyCoverImage: (
    trackId: string,
    coverImage?: { mimeType: string; data: ArrayBuffer },
  ) => string | undefined
  closeAudioRuntime: () => void
  ensureAudioRuntime: () => Promise<AudioRuntime>
  decodeWorkerRef: DecodeWorkerRef
  metadataWorkerRef: MetadataWorkerRef
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
}: UseLibraryWorkerOptions)
{
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

  useEffect(() =>
  {
    const metadataWorker = new Worker(
      new URL('../../workers/metadata/metadata.worker.ts', import.meta.url),
      { type: 'module' },
    )
    const decodeWorker = new Worker(
      new URL('../../workers/decoder/audio-decode.worker.ts', import.meta.url),
      { type: 'module' },
    )
    const metadataApi = Comlink.wrap<MetadataWorkerApi>(metadataWorker)
    const decodeApi = Comlink.wrap<DecodeWorkerApi>(decodeWorker)
    let scanChunkBuffer: Track[] = []
    let scanChunkFrame = 0
    const pendingArtistByTrackId = new Map<
      string,
      Pick<Track, 'artist' | 'artistStatus'>
    >()

    function flushScanChunkBuffer()
    {
      if (!scanChunkBuffer.length)
      {
        scanChunkFrame = 0
        return
      }

      const tracks = scanChunkBuffer.map((track) =>
      {
        const pendingArtist = pendingArtistByTrackId.get(track.id)

        if (!pendingArtist)
        {
          return track
        }

        pendingArtistByTrackId.delete(track.id)
        return { ...track, ...pendingArtist }
      })
      scanChunkBuffer = []
      scanChunkFrame = 0
      appendScanResults(tracks)
    }

    function scheduleScanChunkFlush()
    {
      if (scanChunkFrame !== 0)
      {
        return
      }

      scanChunkFrame = window.requestAnimationFrame(() =>
      {
        flushScanChunkBuffer()
      })
    }

    function handleCoverLoaded(
      message: Extract<MetadataWorkerResponse, { type: 'coverLoaded' }>,
    )
    {
      const coverUrl = applyCoverImage(message.trackId, message.coverImage)

      if (!coverUrl)
      {
        return
      }

      patchTrack(message.trackId, { coverUrl })
    }

    function applyTrackArtist(trackId: string, artist: string | null)
    {
      const trackExists = useMusicAppStore
        .getState()
        .tracks.some((track) => track.id === trackId)
      const patch = artist
        ? { artist, artistStatus: 'loaded' as const }
        : { artist: '', artistStatus: 'empty' as const }

      if (!trackExists)
      {
        pendingArtistByTrackId.set(trackId, patch)
        return
      }

      patchTrack(trackId, patch)
    }

    function handleDecodeProgress(
      message: Extract<DecodeWorkerResponse, { type: 'decodeProgress' }>,
    )
    {
      const activeTrackId = useMusicAppStore.getState().player.currentTrackId

      if (message.trackId && message.trackId !== activeTrackId)
      {
        return
      }

      setScanProgress(message.message)
    }

    async function startAutoplay(runtime: AudioRuntime, trackId: string)
    {
      if (!pendingAutoplayRef.current)
      {
        return
      }

      if (useMusicAppStore.getState().player.currentTrackId !== trackId)
      {
        return
      }

      await runtime.context.resume()

      if (useMusicAppStore.getState().player.currentTrackId !== trackId)
      {
        return
      }

      runtime.node.port.postMessage({ type: 'play' })
    }

    const handleMetadataWorkerMessage = async (message: MetadataWorkerResponse) =>
    {
      if (message.type === 'scanProgress')
      {
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

      if (message.type === 'scanChunk')
      {
        scanChunkBuffer.push(...message.tracks)
        scheduleScanChunkFlush()
        return
      }

      if (message.type === 'scanComplete')
      {
        if (scanChunkFrame !== 0)
        {
          window.cancelAnimationFrame(scanChunkFrame)
        }
        flushScanChunkBuffer()
        const queueIds = completeScanResults(message.summary)

        const preloadTrackIds = queueIds.slice(0, 12)
        if (preloadTrackIds.length > 0)
        {
          postToMetadataWorker({ type: 'preloadCovers', trackIds: preloadTrackIds })
          postToMetadataWorker({
            type: 'preloadTrackMetadata',
            trackIds: preloadTrackIds,
          })
        }

        toast.success(`Scanned ${message.summary.supported} playable tracks`)
        return
      }

      if (message.type === 'scanError')
      {
        setScanProgress('')
        toast.error(message.message)
        return
      }

      if (message.type === 'trackMetadataLoaded')
      {
        applyTrackArtist(message.trackId, message.artist)
        return
      }

      if (message.type === 'trackMetadataFailed')
      {
        patchTrack(message.trackId, { artistStatus: 'error' })
        return
      }

      if (message.type === 'coverLoaded')
      {
        handleCoverLoaded(message)
        return
      }

      return undefined
    }

    const handleDecodeWorkerMessage = async (message: DecodeWorkerResponse) =>
    {
      if (message.type === 'decodeProgress')
      {
        handleDecodeProgress(message)
        return
      }

      if (message.type === 'decodedTrack')
      {
        try
        {
          const coverUrl = applyCoverImage(message.trackId, message.coverImage)
          patchTrack(message.trackId, {
            duration: message.duration,
            sampleRate: message.sampleRate,
            channelCount: message.channelCount,
            coverUrl,
          })

          if (useMusicAppStore.getState().player.currentTrackId !== message.trackId)
          {
            return
          }

          const runtime = await ensureAudioRuntime()

          if (useMusicAppStore.getState().player.currentTrackId !== message.trackId)
          {
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
          updatePlayer((state) =>
          {
            if (state.currentTrackId !== message.trackId)
            {
              return state
            }

            return {
              ...state,
              status: pendingAutoplayRef.current ? 'playing' : 'ready',
              duration: message.duration,
              position: 0,
              bufferedRanges: [ [ 0, message.duration ] ],
            }
          })
          setScanProgress('')
          await startAutoplay(runtime, message.trackId)
        } catch (error)
        {
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

      if (message.type === 'decodeError')
      {
        const activeTrackId = useMusicAppStore.getState().player.currentTrackId

        if (message.trackId && message.trackId !== activeTrackId)
        {
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

    void metadataApi
      .setMessageHandler(Comlink.proxy(handleMetadataWorkerMessage))
      .catch(() => undefined)
    void decodeApi
      .setMessageHandler(Comlink.proxy(handleDecodeWorkerMessage))
      .catch(() => undefined)
    metadataWorkerRef.current = { api: metadataApi, worker: metadataWorker }
    decodeWorkerRef.current = { api: decodeApi, worker: decodeWorker }

    return () =>
    {
      if (scanChunkFrame !== 0)
      {
        window.cancelAnimationFrame(scanChunkFrame)
      }
      if (metadataWorkerRef.current?.worker === metadataWorker)
      {
        metadataWorkerRef.current = null
      }
      if (decodeWorkerRef.current?.worker === decodeWorker)
      {
        decodeWorkerRef.current = null
      }
      metadataApi[Comlink.releaseProxy]()
      decodeApi[Comlink.releaseProxy]()
      metadataWorker.terminate()
      decodeWorker.terminate()
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
