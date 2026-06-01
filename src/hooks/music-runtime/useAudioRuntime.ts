import { useRef } from 'react'
import { toast } from 'sonner'
import { useShallow } from 'zustand/react/shallow'
import playerWorkletUrl from '@/worklets/player-worklet.ts?worklet'
import { useMusicAppStore } from '@/stores/useMusicAppStore'
import type { AudioWorkletResponse } from '@/types/audio'
import type {
  AudioRuntime,
  DecodeWorkerRequest,
  PendingAutoplayRef,
  PostToDecodeWorker,
} from '@/types/audio'

interface UseAudioRuntimeOptions {
  pendingAutoplayRef: PendingAutoplayRef
  postToDecodeWorker: PostToDecodeWorker
}

export function useAudioRuntime({
  pendingAutoplayRef,
  postToDecodeWorker,
}: UseAudioRuntimeOptions) {
  const audioRuntimeRef = useRef<AudioRuntime | null>(null)
  const { setLevels, updatePlayer } = useMusicAppStore(
    useShallow((state) => ({
      setLevels: state.setLevels,
      updatePlayer: state.updatePlayer,
    })),
  )

  function handleTrackEnded() {
    const { player, tracks } = useMusicAppStore.getState()
    const { currentTrackId, queue } = player
    const currentIndex = queue.findIndex(
      (trackId) => trackId === currentTrackId,
    )
    const nextTrackId = queue[currentIndex + 1]

    if (!nextTrackId) {
      updatePlayer((state) => ({
        ...state,
        status: 'paused',
        position: state.duration,
      }))
      return
    }

    const nextTrack = tracks.find((track) => track.id === nextTrackId)

    if (!nextTrack?.fileHandle) {
      const error = 'Track handle is no longer available. Rescan the folder.'
      updatePlayer((state) => ({
        ...state,
        status: 'error',
        error,
      }))
      toast.error(error)
      return
    }

    pendingAutoplayRef.current = true
    audioRuntimeRef.current?.node.port.postMessage({ type: 'clear' })
    postToDecodeWorker({ type: 'loadTrack', track: nextTrack } satisfies DecodeWorkerRequest)
    updatePlayer((state) => ({
      ...state,
      status: 'loading',
      currentTrackId: nextTrackId,
      position: 0,
      duration: 0,
      bufferedRanges: [],
    }))
  }

  async function createAudioRuntime() {
    const context = new AudioContext({ latencyHint: 'interactive' })
    await context.audioWorklet.addModule(playerWorkletUrl)
    const node = new AudioWorkletNode(context, 'music-player', {
      numberOfOutputs: 1,
      outputChannelCount: [2],
    })

    node.connect(context.destination)
    node.port.onmessage = (event: MessageEvent<AudioWorkletResponse>) => {
      const message = event.data

      if (message.type === 'positionUpdate') {
        updatePlayer((state) => ({
          ...state,
          position: message.position,
        }))
        setLevels(message.levels)
        return
      }

      if (message.type === 'bufferStatus') {
        updatePlayer((state) => ({
          ...state,
          bufferedRanges: message.bufferedRanges,
        }))
        return
      }

      if (message.type === 'renderError') {
        updatePlayer((state) => ({
          ...state,
          status: 'error',
          error: message.message,
        }))
        toast.error(message.message)
        return
      }

      if (message.type === 'ended') {
        handleTrackEnded()
      }
    }

    node.port.postMessage({ type: 'initEngine' })
    audioRuntimeRef.current = { context, node }
    return audioRuntimeRef.current
  }

  async function ensureAudioRuntime() {
    const existingRuntime = audioRuntimeRef.current

    if (!existingRuntime) {
      return await createAudioRuntime()
    }

    if (existingRuntime.context.state !== 'suspended') {
      return existingRuntime
    }

    await existingRuntime.context.resume()
    return existingRuntime
  }

  function closeAudioRuntime() {
    const runtime = audioRuntimeRef.current
    audioRuntimeRef.current = null
    void runtime?.context.close()
  }

  return {
    audioRuntimeRef,
    closeAudioRuntime,
    ensureAudioRuntime,
  }
}
