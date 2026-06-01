import { createContext } from 'react'
import type { Capability } from '@/lib/music-player'

export interface MusicRuntimeContextValue {
  capabilities: Capability[]
  loadTrack: (trackId: string, autoplay?: boolean) => Promise<void>
  pickFolder: () => Promise<void>
  playNext: () => void
  playPrevious: () => void
  seekTo: (value: number[]) => void
  setVolume: (value: number[]) => void
  togglePlayback: () => Promise<void>
  preloadTrackCovers: (trackIds: string[]) => void
  preloadTrackMetadata: (trackIds: string[]) => void
}

export const MusicRuntimeContext =
  createContext<MusicRuntimeContextValue | null>(null)
