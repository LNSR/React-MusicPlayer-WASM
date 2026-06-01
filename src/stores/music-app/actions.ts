import type { StoreApi } from 'zustand'
import { defaultSummary, initialPlayerState } from '@/lib/music-player'
import type { ScanSummary, Track } from '@/types/audio'
import type { MusicAppActions, MusicAppStore } from './state'

type SetMusicAppState = StoreApi<MusicAppStore>['setState']

function completeQueuedTracks(tracks: Track[]) {
  return tracks.map((track) => track.id)
}

function resetCurrentTrack<T extends { currentTrackId?: string | undefined }>(
  player: T,
) {
  const nextPlayer = { ...player }
  delete nextPlayer.currentTrackId
  return nextPlayer
}

export function createMusicAppActions(
  set: SetMusicAppState,
): MusicAppActions {
  return {
    setScanProgress: (scanProgress) => set({ scanProgress }),
    setLevels: (levels) => set({ levels }),
    updatePlayer: (updater) =>
      set((state) => ({
        player: updater(state.player),
      })),
    setPlatformUI: (platformUI) => set({ platformUI }),
    setSearchQuery: (searchQuery) => set({ searchQuery }),
    setLibrarySearchQuery: (librarySearchQuery) => set({ librarySearchQuery }),
    setLibraryWidth: (libraryWidth) => set({ libraryWidth }),
    updateLibraryWidth: (updater) =>
      set((state) => ({
        libraryWidth: updater(state.libraryWidth),
      })),
    setIsResizingLibrary: (isResizingLibrary) => set({ isResizingLibrary }),
    patchTrack: (trackId, patch) =>
      set((state) => ({
        tracks: state.tracks.map((track) =>
          track.id === trackId ? { ...track, ...patch } : track,
        ),
      })),
    resetLibrary: (directoryName) =>
      set({
        tracks: [],
        summary: defaultSummary,
        scanProgress: `Scanning ${directoryName}`,
        player: initialPlayerState,
      }),
    appendScanResults: (tracks) =>
      set((state) => ({
        tracks: state.tracks.concat(tracks),
        summary: {
          ...state.summary,
          supported: state.summary.supported + tracks.length,
        },
      })),
    updateScanSummary: (summary) =>
      set((state) => ({
        summary: {
          ...state.summary,
          ...summary,
        },
      })),
    completeScanResults: (summary: ScanSummary) => {
      let queueIds: string[] = []

      set((state) => {
        queueIds = completeQueuedTracks(state.tracks)

        return {
          summary,
          scanProgress: '',
          player: {
            ...resetCurrentTrack(state.player),
            status: state.tracks.length ? 'ready' : 'idle',
            queue: queueIds,
            position: 0,
            duration: 0,
          },
        }
      })

      return queueIds
    },
  }
}
