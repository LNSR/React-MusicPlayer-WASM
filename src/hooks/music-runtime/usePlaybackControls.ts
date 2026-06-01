import { toast } from 'sonner'
import { useMusicAppStore } from '@/stores/useMusicAppStore'
import type {
  AudioRuntime,
  AudioRuntimeRef,
  DecodeWorkerRequest,
  PendingAutoplayRef,
  PostToDecodeWorker,
} from '@/types/audio'

interface UsePlaybackControlsOptions {
  audioRuntimeRef: AudioRuntimeRef
  ensureAudioRuntime: () => Promise<AudioRuntime>
  pendingAutoplayRef: PendingAutoplayRef
  postToDecodeWorker: PostToDecodeWorker
}

function getDecodeTrackRequest(trackId: string): DecodeWorkerRequest | undefined {
  const track = useMusicAppStore.getState().tracks.find(
    (candidate) => candidate.id === trackId,
  )

  if (!track?.fileHandle) {
    return undefined
  }

  return { type: 'loadTrack', track }
}

export function usePlaybackControls({
  audioRuntimeRef,
  ensureAudioRuntime,
  pendingAutoplayRef,
  postToDecodeWorker,
}: UsePlaybackControlsOptions) {
  const updatePlayer = useMusicAppStore((state) => state.updatePlayer)

  async function loadTrack(trackId: string, autoplay = true) {
    const request = getDecodeTrackRequest(trackId)

    if (!request) {
      const error = 'Track handle is no longer available. Rescan the folder.'
      updatePlayer((state) => ({
        ...state,
        status: 'error',
        error,
      }))
      toast.error(error)
      return
    }

    pendingAutoplayRef.current = autoplay
    audioRuntimeRef.current?.node.port.postMessage({ type: 'clear' })
    updatePlayer((state) => ({
      ...state,
      status: 'loading',
      currentTrackId: trackId,
      position: 0,
      duration: 0,
      bufferedRanges: [],
    }))
    const runtime = await ensureAudioRuntime()
    runtime.node.port.postMessage({ type: 'clear' })
    postToDecodeWorker(request)
  }

  async function loadFirstQueuedTrack() {
    const firstTrackId = useMusicAppStore.getState().player.queue[0]

    if (!firstTrackId) {
      return
    }

    await loadTrack(firstTrackId, true)
  }

  async function togglePlayback() {
    const runtime = await ensureAudioRuntime()
    const player = useMusicAppStore.getState().player

    if (!player.currentTrackId) {
      await loadFirstQueuedTrack()
      return
    }

    if (player.status === 'playing') {
      runtime.node.port.postMessage({ type: 'pause' })
      updatePlayer((state) => ({ ...state, status: 'paused' }))
      return
    }

    await runtime.context.resume()
    runtime.node.port.postMessage({ type: 'play' })
    updatePlayer((state) => ({ ...state, status: 'playing' }))
  }

  function seekTo(value: number[]) {
    const position = value[0] ?? 0
    const trackId = useMusicAppStore.getState().player.currentTrackId

    audioRuntimeRef.current?.node.port.postMessage({ type: 'seek', position })
    updatePlayer((state) => ({ ...state, position }))

    if (!trackId) {
      return
    }
  }

  function setVolume(value: number[]) {
    const nextVolume = value[0] ?? 0
    audioRuntimeRef.current?.node.port.postMessage({
      type: 'setVolume',
      volume: nextVolume,
    })
    updatePlayer((state) => ({ ...state, volume: nextVolume }))
  }

  function playNext() {
    const { currentTrackId, queue } = useMusicAppStore.getState().player
    const currentIndex = queue.findIndex(
      (trackId) => trackId === currentTrackId,
    )
    const nextTrackId = queue[currentIndex + 1] ?? queue[0]

    if (!nextTrackId) {
      return
    }

    void loadTrack(nextTrackId, true)
  }

  function playPrevious() {
    const { currentTrackId, queue } = useMusicAppStore.getState().player
    const currentIndex = queue.findIndex(
      (trackId) => trackId === currentTrackId,
    )
    const previousTrackId = queue[currentIndex - 1] ?? queue[queue.length - 1]

    if (!previousTrackId) {
      return
    }

    void loadTrack(previousTrackId, true)
  }

  return {
    loadTrack,
    playNext,
    playPrevious,
    seekTo,
    setVolume,
    togglePlayback,
  }
}
