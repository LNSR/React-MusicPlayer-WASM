import type { PendingAutoplayRef } from '@/types/audio'
import { useAudioRuntime } from './useAudioRuntime'
import { useCoverUrls } from './useCoverUrls'
import { useLibraryWorker } from './useLibraryWorker'
import { useWorkerBridge } from './useWorkerBridge'

interface UseRuntimeWorkerServicesOptions {
  pendingAutoplayRef: PendingAutoplayRef
}

export function useRuntimeWorkerServices({
  pendingAutoplayRef,
}: UseRuntimeWorkerServicesOptions) {
  const { applyCoverImage, revokeAllCoverUrls } = useCoverUrls()
  const {
    decodeWorkerRef,
    metadataWorkerRef,
    postToDecodeWorker,
    postToMetadataWorker,
  } = useWorkerBridge()
  const { audioRuntimeRef, closeAudioRuntime, ensureAudioRuntime } =
    useAudioRuntime({
      pendingAutoplayRef,
      postToDecodeWorker,
    })

  useLibraryWorker({
    applyCoverImage,
    closeAudioRuntime,
    decodeWorkerRef,
    ensureAudioRuntime,
    metadataWorkerRef,
    pendingAutoplayRef,
    postToMetadataWorker,
    revokeAllCoverUrls,
  })

  function preloadTrackCovers(trackIds: string[]) {
    if (trackIds.length > 0) {
      postToMetadataWorker({ type: 'preloadCovers', trackIds })
    }
  }

  function preloadTrackMetadata(trackIds: string[]) {
    if (trackIds.length > 0) {
      postToMetadataWorker({ type: 'preloadTrackMetadata', trackIds })
    }
  }

  return {
    audioRuntimeRef,
    ensureAudioRuntime,
    postToDecodeWorker,
    postToMetadataWorker,
    preloadTrackCovers,
    preloadTrackMetadata,
    revokeAllCoverUrls,
  }
}
