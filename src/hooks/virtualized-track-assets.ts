import type { VirtualItem } from '@tanstack/react-virtual'
import type { RefObject } from 'react'
import type { Track } from '@/types/audio'

interface RequestVisibleTrackAssetsOptions {
  preloadTrackCovers: (trackIds: string[]) => void
  preloadTrackMetadata: (trackIds: string[]) => void
  requestedCoverIdsRef: RefObject<Set<string> | null>
  requestedMetadataIdsRef: RefObject<Set<string> | null>
  tracks: Track[]
  virtualItems: VirtualItem[]
}

export function requestVisibleTrackAssets({
  preloadTrackCovers,
  preloadTrackMetadata,
  requestedCoverIdsRef,
  requestedMetadataIdsRef,
  tracks,
  virtualItems,
}: RequestVisibleTrackAssetsOptions) {
  const requestedCoverIds = requestedCoverIdsRef.current
  const requestedMetadataIds = requestedMetadataIdsRef.current
  if (!requestedCoverIds || !requestedMetadataIds) {
    return
  }

  if (tracks.length === 0) {
    requestedCoverIds.clear()
    requestedMetadataIds.clear()
    return
  }

  const preloadCoverIds: string[] = []
  const preloadMetadataIds: string[] = []

  for (const virtualItem of virtualItems) {
    const track = tracks[virtualItem.index]
    if (!track) {
      continue
    }

    if (!track.coverUrl && !requestedCoverIds.has(track.id)) {
      requestedCoverIds.add(track.id)
      preloadCoverIds.push(track.id)
    }

    if (!track.artist && !requestedMetadataIds.has(track.id)) {
      requestedMetadataIds.add(track.id)
      preloadMetadataIds.push(track.id)
    }
  }

  if (preloadCoverIds.length > 0) {
    preloadTrackCovers(preloadCoverIds)
  }

  if (preloadMetadataIds.length > 0) {
    preloadTrackMetadata(preloadMetadataIds)
  }
}
