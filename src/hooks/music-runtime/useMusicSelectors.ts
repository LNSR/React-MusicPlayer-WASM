import { useShallow } from 'zustand/react/shallow'
import { useMusicAppStore } from '@/stores/useMusicAppStore'
import {
  selectActiveTrack,
  selectFilteredTracks,
  selectLibraryFilteredTracks,
  selectQueuedTracks,
} from '@/stores/music-app/selectors'

export function useFilteredTracks() {
  return useMusicAppStore(useShallow(selectFilteredTracks))
}

export function useLibraryFilteredTracks() {
  return useMusicAppStore(useShallow(selectLibraryFilteredTracks))
}

export function useActiveTrack() {
  return useMusicAppStore(selectActiveTrack)
}

export function useQueuedTracks() {
  return useMusicAppStore(useShallow(selectQueuedTracks))
}
