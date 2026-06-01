import { useRef } from 'react'
import { getCapabilities } from '@/lib/music-player'
import { useFolderPicker } from './music-runtime/useFolderPicker'
import { useLibraryResize } from './music-runtime/useLibraryResize'
import { usePlatformSync } from './music-runtime/usePlatformSync'
import { usePlaybackControls } from './music-runtime/usePlaybackControls'
import { useRuntimeWorkerServices } from './music-runtime/useRuntimeWorkerServices'

export function useMusicRuntime() {
  const pendingAutoplayRef = useRef(false)
  const capabilities = getCapabilities()
  const isSupported = capabilities.every((capability) => capability.supported)
  const layoutRef = useLibraryResize()

  usePlatformSync()

  const {
    audioRuntimeRef,
    ensureAudioRuntime,
    postToDecodeWorker,
    postToMetadataWorker,
    preloadTrackCovers,
    preloadTrackMetadata,
    revokeAllCoverUrls,
  } = useRuntimeWorkerServices({ pendingAutoplayRef })

  const pickFolder = useFolderPicker({
    isSupported,
    postToMetadataWorker,
    revokeAllCoverUrls,
  })
  const playbackControls = usePlaybackControls({
    audioRuntimeRef,
    ensureAudioRuntime,
    pendingAutoplayRef,
    postToDecodeWorker,
  })

  return {
    ...playbackControls,
    capabilities,
    isSupported,
    layoutRef,
    pickFolder,
    preloadTrackCovers,
    preloadTrackMetadata,
  }
}
