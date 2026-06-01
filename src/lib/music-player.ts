import type { PlayerState, ScanSummary, Track } from '@/types/audio'

export function getTrackDisplayName(track: Pick<Track, 'name'>) {
  return track.name
}

export function getTrackArtistLabel(track: Pick<Track, 'artist'>) {
  return track.artist?.trim() || 'Unknown artist'
}

export interface Capability {
  label: string
  supported: boolean
}

export type LayoutMode = 'mobile' | 'tablet' | 'desktop'

export interface PlatformUI {
  layoutMode: LayoutMode
  isTouch: boolean
  label: string
}

const MOBILE_BREAKPOINT = 768
const DESKTOP_BREAKPOINT = 1280
export const MIN_LIBRARY_WIDTH = 220
export const DEFAULT_LIBRARY_WIDTH = 272
export const MAX_LIBRARY_WIDTH = 460

export const initialPlayerState: PlayerState = {
  status: 'idle',
  queue: [],
  position: 0,
  duration: 0,
  volume: 0.85,
  bufferedRanges: [],
  error: undefined,
}

export const defaultSummary: ScanSummary = {
  supported: 0,
  skipped: 0,
  directories: 0,
}

export function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '0:00'
  }

  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = Math.floor(seconds % 60)
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
}

export function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`
  }

  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function getCapabilities(): Capability[] {
  const canUseDirectoryPicker = 'showDirectoryPicker' in window
  const canUseAudioWorklet = 'AudioWorkletNode' in window && 'AudioContext' in window
  const canUseWasm = 'WebAssembly' in window

  return [
    { label: 'Secure context', supported: window.isSecureContext },
    { label: 'Cross-origin isolated', supported: window.crossOriginIsolated },
    { label: 'Folder access', supported: canUseDirectoryPicker },
    { label: 'AudioWorklet', supported: canUseAudioWorklet },
    { label: 'WebAssembly', supported: canUseWasm },
  ]
}

export function getPlatformUI(): PlatformUI {
  const width = window.innerWidth
  const isTouch =
    window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0
  const userAgent = navigator.userAgent
  const isIOS = /iPhone|iPad|iPod/i.test(userAgent)
  const isAndroid = /Android/i.test(userAgent)

  if (width < MOBILE_BREAKPOINT) {
    return {
      layoutMode: 'mobile',
      isTouch,
      label: isIOS ? 'iOS compact' : isAndroid ? 'Android compact' : 'Compact',
    }
  }

  if (width < DESKTOP_BREAKPOINT) {
    return {
      layoutMode: 'tablet',
      isTouch,
      label: isTouch ? 'Tablet touch' : 'Tablet',
    }
  }

  return {
    layoutMode: 'desktop',
    isTouch,
    label: isTouch ? 'Touch desktop' : 'Desktop',
  }
}

export function getVisualizerBars(
  levels: number[],
  status: PlayerState['status'],
  count = 28,
) {
  return Array.from({ length: count }, (_, index) => {
    const base = Math.sin(index * 1.8) * 0.5 + 0.5
    const energy = Math.max(
      levels[index % 2] ?? 0,
      status === 'playing' ? 0.18 : 0.05,
    )

    return Math.max(12, Math.min(100, (base * 0.62 + energy) * 100))
  })
}

export function filterTracks(tracks: Track[], query: string) {
  const normalizedQuery = query.trim().toLowerCase()

  if (!normalizedQuery) {
    return tracks
  }

  return tracks.filter((track) =>
    [
      track.name,
      track.artist ?? '',
      track.relativePath,
      track.format,
      track.duration ? formatTime(track.duration) : '',
    ]
      .join(' ')
      .toLowerCase()
      .includes(normalizedQuery),
  )
}
