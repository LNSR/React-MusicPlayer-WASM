import { useRef } from 'react'
import { toast } from 'sonner'
import type {
  DecodeWorkerRequest,
  MetadataWorkerRequest,
  WorkerRef,
} from '@/types/audio'

function postWorkerMessage(worker: Worker | null, message: unknown, label: string) {
  if (!worker) {
    toast.error(`${label} is not ready yet. Try again in a moment.`)
    return
  }

  worker.postMessage(message)
}

export function useWorkerBridge(): {
  postToMetadataWorker: (message: MetadataWorkerRequest) => void
  postToDecodeWorker: (message: DecodeWorkerRequest) => void
  metadataWorkerRef: WorkerRef
  decodeWorkerRef: WorkerRef
} {
  const metadataWorkerRef = useRef<Worker | null>(null)
  const decodeWorkerRef = useRef<Worker | null>(null)

  function postToMetadataWorker(message: MetadataWorkerRequest) {
    postWorkerMessage(metadataWorkerRef.current, message, 'Metadata worker')
  }

  function postToDecodeWorker(message: DecodeWorkerRequest) {
    postWorkerMessage(decodeWorkerRef.current, message, 'Decode worker')
  }

  return {
    postToMetadataWorker,
    postToDecodeWorker,
    metadataWorkerRef,
    decodeWorkerRef,
  }
}
