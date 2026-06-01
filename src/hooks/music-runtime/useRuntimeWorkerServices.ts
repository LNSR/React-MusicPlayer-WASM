import type { PendingAutoplayRef } from '@/types/audio'
import { useMusicAppStore } from '@/stores/useMusicAppStore'
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
      const { patchTrack, tracks } = useMusicAppStore.getState()
      const trackIdsToMark = new Set(trackIds)

      for (const track of tracks) {
        if (
          trackIdsToMark.has(track.id) &&
          !track.artist &&
          track.artistStatus !== 'loading' &&
          track.artistStatus !== 'loaded' &&
          track.artistStatus !== 'empty'
        ) {
          patchTrack(track.id, { artistStatus: 'loading' })
        }
      }

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
