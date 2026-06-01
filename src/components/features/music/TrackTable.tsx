'use no memo'

import { useEffect, useRef } from 'react'
import { useVirtualizer, type VirtualItem } from '@tanstack/react-virtual'
import { useShallow } from 'zustand/react/shallow'
import { FolderOpen } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useFilteredTracks } from '@/hooks/music-runtime/useMusicSelectors'
import { useMusicRuntimeContext } from '@/context/AppContext/useMusicRuntimeContext'
import {
  formatBytes,
  formatTime,
  getTrackArtistStatusLabel,
  getTrackDisplayName,
} from '@/lib/music-player'
import { createTrackRequestCache, type TrackRequestCache } from '@/lib/lru-caches'
import { useMusicAppStore } from '@/stores/useMusicAppStore'
import type { Track } from '@/types/audio'
import { TrackArtistLabel } from './TrackArtistLabel'
import { TrackCover } from './TrackCover'
import { requestVisibleTrackAssets } from '../../../hooks/virtualized-track-assets'

interface TrackRowsProps {
  activeTrackId: string | undefined
  onPlay: (trackId: string) => void
  tracks: Track[]
  virtualItems: VirtualItem[]
}

export function TrackTable() {
  const tracks = useFilteredTracks()
  const { activeTrackId, compact, searchQuery } = useMusicAppStore(
    useShallow((state) => ({
      activeTrackId: state.player.currentTrackId,
      compact: state.platformUI.layoutMode === 'mobile',
      searchQuery: state.searchQuery,
    })),
  )
  const { loadTrack, preloadTrackCovers, preloadTrackMetadata } = useMusicRuntimeContext()
  const scrollParentRef = useRef<HTMLDivElement | null>(null)
  const requestedCoverIdsRef = useRef<TrackRequestCache | null>(null)
  const requestedMetadataIdsRef = useRef<TrackRequestCache | null>(null)
  if (requestedCoverIdsRef.current === null) {
    requestedCoverIdsRef.current = createTrackRequestCache()
  }
  if (requestedMetadataIdsRef.current === null) {
    requestedMetadataIdsRef.current = createTrackRequestCache()
  }
  // TanStack Virtual exposes imperative helpers that React Compiler cannot memoize.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: tracks.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => (compact ? 84 : 60),
    overscan: 10,
    onChange: (instance) => {
      requestVisibleTrackAssets({
        preloadTrackCovers,
        preloadTrackMetadata,
        requestedCoverIdsRef,
        requestedMetadataIdsRef,
        tracks,
        virtualItems: instance.getVirtualItems(),
      })
    },
  })

  useEffect(() => {
    requestVisibleTrackAssets({
      preloadTrackCovers,
      preloadTrackMetadata,
      requestedCoverIdsRef,
      requestedMetadataIdsRef,
      tracks,
      virtualItems: virtualizer.getVirtualItems(),
    })
  }, [preloadTrackCovers, preloadTrackMetadata, tracks, virtualizer])

  if (!tracks.length) {
    return (
      <div className="music-shell-soft px-6 py-12 text-center text-sm text-muted-foreground">
        <FolderOpen className="mx-auto mb-3 size-9" />
        {searchQuery
          ? 'No tracks match your search.'
          : 'Open a folder to scan your local tracks.'}
      </div>
    )
  }

  if (compact) {
    return (
      <ScrollArea
        type="always"
        viewportRef={scrollParentRef}
        className="h-[32rem] rounded-lg"
      >
        <div
          className="relative"
          style={{ height: `${virtualizer.getTotalSize()}px` }}
        >
          <CompactTrackRows
            activeTrackId={activeTrackId}
            onPlay={(trackId) => void loadTrack(trackId, true)}
            tracks={tracks}
            virtualItems={virtualizer.getVirtualItems()}
          />
        </div>
      </ScrollArea>
    )
  }

  return (
    <div className="overflow-hidden rounded-md">
      <div className="grid grid-cols-[2.5rem_minmax(0,1fr)_5rem] border-b border-white/10 px-4 pb-2 text-xs uppercase text-muted-foreground md:grid-cols-[2.5rem_minmax(0,1fr)_5rem_5rem] lg:grid-cols-[2.5rem_minmax(0,1fr)_7rem_7rem_5rem]">
        <span>#</span>
        <span>Artist</span>
        <span className="hidden md:block">Format</span>
        <span className="hidden lg:block">Size</span>
        <span className="text-right">Time</span>
      </div>
      <ScrollArea
        type="always"
        viewportRef={scrollParentRef}
        className="h-[min(48rem,calc(100svh-25rem))]"
      >
        <div
          className="relative pt-2"
          style={{ height: `${virtualizer.getTotalSize()}px` }}
        >
          <DesktopTrackRows
            activeTrackId={activeTrackId}
            onPlay={(trackId) => void loadTrack(trackId, true)}
            tracks={tracks}
            virtualItems={virtualizer.getVirtualItems()}
          />
        </div>
      </ScrollArea>
    </div>
  )
}

function CompactTrackRows({
  activeTrackId,
  onPlay,
  tracks,
  virtualItems,
}: TrackRowsProps) {
  return virtualItems.map((virtualItem) => {
    const track = tracks[virtualItem.index]

    if (!track) {
      return null
    }

    return (
      <button
        key={track.id}
        type="button"
        onClick={() => onPlay(track.id)}
        className={`music-track-row ${
          activeTrackId === track.id ? 'border-primary/45 bg-primary/15' : ''
        }`}
        style={{
          transform: `translateY(${virtualItem.start}px)`,
        }}
        title={`${getTrackDisplayName(track)} - ${getTrackArtistStatusLabel(track)}`}
      >
        <span className="w-5 shrink-0 text-xs font-semibold text-muted-foreground">
          {virtualItem.index + 1}
        </span>
        <TrackCover
          coverUrl={track.coverUrl}
          title={getTrackDisplayName(track)}
          className="size-12 rounded"
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-white">
            {getTrackDisplayName(track)}
          </span>
          <TrackArtistLabel track={track} className="mt-0.5 text-xs text-white/80" />
          <span className="mt-1 block text-[11px] uppercase tracking-[0.12em] text-white/45">
            {track.format} · {formatBytes(track.size)}
          </span>
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {track.duration ? formatTime(track.duration) : '--:--'}
        </span>
      </button>
    )
  })
}

function DesktopTrackRows({
  activeTrackId,
  onPlay,
  tracks,
  virtualItems,
}: TrackRowsProps) {
  return virtualItems.map((virtualItem) => {
    const track = tracks[virtualItem.index]

    if (!track) {
      return null
    }

    return (
      <button
        key={track.id}
        type="button"
        onClick={() => onPlay(track.id)}
        className={`absolute left-0 right-2 grid grid-cols-[2.5rem_minmax(0,1fr)_5rem] items-center rounded-md px-4 py-2 text-left text-sm transition-colors hover:bg-primary/10 md:grid-cols-[2.5rem_minmax(0,1fr)_5rem_5rem] lg:grid-cols-[2.5rem_minmax(0,1fr)_7rem_7rem_5rem] ${
          activeTrackId === track.id ? 'bg-primary/15 text-primary' : ''
        }`}
        style={{
          transform: `translateY(${virtualItem.start}px)`,
        }}
        title={`${getTrackDisplayName(track)} - ${getTrackArtistStatusLabel(track)}`}
      >
        <span className="text-muted-foreground">{virtualItem.index + 1}</span>
        <span className="grid min-w-0 grid-cols-[2.75rem_1fr] gap-3">
          <TrackCover
            coverUrl={track.coverUrl}
            title={getTrackDisplayName(track)}
            className="size-11 rounded"
          />
          <span className="min-w-0 self-center">
            <span className="block truncate font-medium text-white">
              {getTrackDisplayName(track)}
            </span>
            <TrackArtistLabel track={track} className="text-xs text-white/80" />
          </span>
        </span>
        <span className="hidden text-muted-foreground md:block">
          {track.format}
        </span>
        <span className="hidden text-muted-foreground lg:block">
          {formatBytes(track.size)}
        </span>
        <span className="text-right text-muted-foreground">
          {track.duration ? formatTime(track.duration) : '--:--'}
        </span>
      </button>
    )
  })
}
