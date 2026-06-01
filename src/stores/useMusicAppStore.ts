import { create } from 'zustand'
import { createMusicAppActions } from './music-app/actions'
import { initialMusicAppState, type MusicAppStore } from './music-app/state'

export const useMusicAppStore = create<MusicAppStore>((set) => ({
  ...initialMusicAppState,
  ...createMusicAppActions(set),
}))

export type {
  MusicAppActions,
  MusicAppState,
  MusicAppStore,
  MusicLibraryActions,
  MusicPlaybackActions,
  MusicUiActions,
} from './music-app/state'
