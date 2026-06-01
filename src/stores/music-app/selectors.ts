import { filterTracks } from '@/lib/music-player'
import type { Track } from '@/types/audio'
import type { MusicAppStore } from './state'

export const selectActiveTrack = (state: MusicAppStore) =>
  state.tracks.find((track) => track.id === state.player.currentTrackId)

export const selectFilteredTracks = (state: MusicAppStore) =>
  filterTracks(state.tracks, state.searchQuery)

export const selectLibraryFilteredTracks = (state: MusicAppStore) =>
  filterTracks(state.tracks, state.librarySearchQuery)

export const selectQueuedTracks = (state: MusicAppStore) =>
  state.player.queue
    .map((trackId) => state.tracks.find((track) => track.id === trackId))
    .filter((track): track is Track => Boolean(track))

export const selectProgressValue = (state: MusicAppStore) =>
  state.player.duration > 0
    ? (state.player.position / state.player.duration) * 100
    : 0
