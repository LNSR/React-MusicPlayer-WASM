/* eslint-disable react-refresh/only-export-components */

import { createContext, use, type ReactNode } from 'react'
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

const MusicRuntimeContext = createContext<MusicRuntimeContextValue | null>(null)

export function MusicRuntimeProvider({
  children,
  value,
}: {
  children: ReactNode
  value: MusicRuntimeContextValue
}) {
  return (
    <MusicRuntimeContext value={value}>
      {children}
    </MusicRuntimeContext>
  )
}

export function useMusicRuntimeContext() {
  const context = use(MusicRuntimeContext)

  if (!context) {
    throw new Error('useMusicRuntimeContext must be used within MusicRuntimeProvider')
  }

  return context
}