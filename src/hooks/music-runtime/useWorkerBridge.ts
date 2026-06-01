import { useCallback, useRef } from 'react'
import { toast } from 'sonner'
import type {
  DecodeWorkerApi,
  DecodeWorkerRequest,
  DecodeWorkerRef,
  MetadataWorkerApi,
  MetadataWorkerRequest,
  MetadataWorkerRef,
} from '@/types/audio'
import type { Remote } from 'comlink'

function reportWorkerError(label: string, error: unknown)
{
  const detail = error instanceof Error ? error.message : 'Worker call failed'
  toast.error(`${label}: ${detail}`)
}

function callWorker<Api>(
  api: Remote<Api> | undefined,
  label: string,
  call: (api: Remote<Api>) => Promise<void>,
)
{
  if (!api)
  {
    toast.error(`${label} is not ready yet. Try again in a moment.`)
    return
  }

  void call(api).catch((error) =>
  {
    reportWorkerError(label, error)
  })
}

export function useWorkerBridge(): {
  postToMetadataWorker: (message: MetadataWorkerRequest) => void
  postToDecodeWorker: (message: DecodeWorkerRequest) => void
  metadataWorkerRef: MetadataWorkerRef
  decodeWorkerRef: DecodeWorkerRef
}
{
  const metadataWorkerRef = useRef<MetadataWorkerRef['current']>(null)
  const decodeWorkerRef = useRef<DecodeWorkerRef['current']>(null)

  const postToMetadataWorker = useCallback((message: MetadataWorkerRequest) =>
  {
    callWorker<MetadataWorkerApi>(
      metadataWorkerRef.current?.api,
      'Metadata worker',
      async (api) =>
      {
        if (message.type === 'scanDirectory')
        {
          await api.scanDirectory(message.directoryHandle)
          return
        }

        if (message.type === 'preloadCovers')
        {
          await api.preloadCovers(message.trackIds)
          return
        }

        await api.preloadTrackMetadata(message.trackIds)
      },
    )
  }, [])

  const postToDecodeWorker = useCallback((message: DecodeWorkerRequest) =>
  {
    callWorker<DecodeWorkerApi>(
      decodeWorkerRef.current?.api,
      'Decode worker',
      async (api) =>
      {
        if (message.type === 'loadTrack')
        {
          await api.loadTrack(message.track)
          return
        }

        if (message.type === 'seek')
        {
          await api.seek(message.trackId, message.position)
          return
        }

        await api.setQueue(message.trackIds)
      },
    )
  }, [])

  return {
    postToMetadataWorker,
    postToDecodeWorker,
    metadataWorkerRef,
    decodeWorkerRef,
  }
}
