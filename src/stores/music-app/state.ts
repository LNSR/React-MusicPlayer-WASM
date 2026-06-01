import {
  DEFAULT_LIBRARY_WIDTH,
  defaultSummary,
  getPlatformUI,
  initialPlayerState,
  type PlatformUI,
} from '@/lib/music-player'
import type { PlayerState, ScanSummary, Track } from '@/types/audio'

export interface MusicAppState {
  tracks: Track[]
  summary: ScanSummary
  scanProgress: string
  levels: number[]
  player: PlayerState
  platformUI: PlatformUI
  searchQuery: string
  librarySearchQuery: string
  libraryWidth: number
  isResizingLibrary: boolean
}

export interface MusicPlaybackActions {
  setLevels: (levels: number[]) => void
  updatePlayer: (updater: (player: PlayerState) => PlayerState) => void
}

export interface MusicLibraryActions {
  appendScanResults: (tracks: Track[]) => void
  completeScanResults: (summary: ScanSummary) => string[]
  patchTrack: (trackId: string, patch: Partial<Track>) => void
  resetLibrary: (directoryName: string) => void
  updateScanSummary: (summary: Partial<ScanSummary>) => void
}

export interface MusicUiActions {
  setIsResizingLibrary: (isResizingLibrary: boolean) => void
  setLibraryWidth: (libraryWidth: number) => void
  setPlatformUI: (platformUI: PlatformUI) => void
  setScanProgress: (scanProgress: string) => void
  setSearchQuery: (searchQuery: string) => void
  setLibrarySearchQuery: (librarySearchQuery: string) => void
  updateLibraryWidth: (updater: (libraryWidth: number) => number) => void
}

export type MusicAppActions =
  & MusicPlaybackActions
  & MusicLibraryActions
  & MusicUiActions

export type MusicAppStore = MusicAppState & MusicAppActions

export const initialMusicAppState: MusicAppState = {
  tracks: [],
  summary: defaultSummary,
  scanProgress: '',
  levels: [0, 0],
  player: initialPlayerState,
  platformUI: getPlatformUI(),
  searchQuery: '',
  librarySearchQuery: '',
  libraryWidth: DEFAULT_LIBRARY_WIDTH,
  isResizingLibrary: false,
}
