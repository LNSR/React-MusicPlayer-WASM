'use no memo'

import { useEffect, useRef, type ReactNode } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useShallow } from 'zustand/react/shallow'
import { FolderOpen, Home, ListMusic, Loader2, Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  filterTracks,
  getTrackDisplayName,
} from '@/lib/music-player'
import { createTrackRequestCache, type TrackRequestCache } from '@/lib/lru-caches'
import { useMusicRuntimeContext } from '@/context/AppContext/useMusicRuntimeContext'
import { useMusicAppStore } from '@/stores/useMusicAppStore'
import type { Track } from '@/types/audio'
import { TrackArtistLabel } from './TrackArtistLabel'
import { TrackCover } from './TrackCover'
import { requestVisibleTrackAssets } from '@/hooks/virtualized-track-assets'

export function LibraryPanel() {
  const {
    activeTrackId,
    librarySearchQuery,
    loading,
    platformLabel,
    summary,
    tracks,
  } =
    useMusicAppStore(
      useShallow((state) => ({
        activeTrackId: state.player.currentTrackId,
        librarySearchQuery: state.librarySearchQuery,
        loading: state.player.status === 'loading',
        platformLabel: state.platformUI.label,
        summary: state.summary,
        tracks: state.tracks,
      })),
    )
  const { loadTrack, pickFolder } = useMusicRuntimeContext()
  const filteredTracks = filterTracks(tracks, librarySearchQuery)

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-2">
      <nav className="music-shell-muted p-3">
        <div className="mb-3 flex min-w-0 items-center justify-between gap-2 px-1">
          <span className="music-clamp-2 music-wrap-text min-w-0 text-xs font-semibold uppercase tracking-[0.2em] text-white/45">
            {platformLabel}
          </span>
          <Badge
            variant="outline"
            className="shrink-0 border-white/10 text-white/70"
          >
            local
          </Badge>
        </div>
        <NavItem icon={<Home />} label="Home" active />
      </nav>
      <section className="music-shell-muted flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <ListMusic className="size-5" />
            Your Library
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => void pickFolder()}
            disabled={loading}
            aria-label="Select music folder"
          >
            {loading ? <Loader2 className="animate-spin" /> : <Plus />}
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-2 px-3 pb-3">
          <LibraryStat label="Tracks" value={summary.supported} />
          <LibraryStat label="Skipped" value={summary.skipped} />
          <LibraryStat label="Folders" value={summary.directories} />
        </div>
        <MiniLibrary
          tracks={filteredTracks}
          activeTrackId={activeTrackId}
          onPlay={(trackId) => void loadTrack(trackId, true)}
        />
      </section>
    </div>
  )
}

function NavItem({
  icon,
  label,
  active = false,
}: {
  icon: ReactNode
  label: string
  active?: boolean
}) {
  return (
    <button
      type="button"
      className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold transition-colors ${
        active ? 'text-white' : 'text-muted-foreground hover:text-white'
      }`}
    >
      <span className="shrink-0 [&_svg]:size-5">{icon}</span>
      <span className="min-w-0 truncate">{label}</span>
    </button>
  )
}

export function LibraryStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-muted p-2 text-center">
      <p className="truncate text-[10px] font-medium uppercase text-muted-foreground">
        {label}
      </p>
      <p className="text-sm font-bold text-white">{value}</p>
    </div>
  )
}

export function MiniLibrary({
  tracks,
  activeTrackId,
  onPlay,
  className,
}: {
  tracks: Track[]
  activeTrackId?: string | undefined
  onPlay: (trackId: string) => void
  className?: string | undefined
}) {
  const { preloadTrackCovers, preloadTrackMetadata } = useMusicRuntimeContext()
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
    estimateSize: () => 58,
    overscan: 8,
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
      <div className="grid min-h-0 flex-1 place-items-center px-6 text-center text-sm text-muted-foreground">
        <div>
          <FolderOpen className="mx-auto mb-3 size-8" />
          Open a folder to fill your library.
        </div>
      </div>
    )
  }

  return (
    <ScrollArea
      type="always"
      viewportRef={scrollParentRef}
      className={`min-h-0 flex-1 ${className ?? ''}`.trim()}
    >
      <div
        className="relative px-2 pb-3"
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const track = tracks[virtualItem.index]

          if (!track) return null

          return (
            <button
              key={track.id}
              type="button"
              onClick={() => onPlay(track.id)}
              className={`music-mini-library-row ${
                activeTrackId === track.id ? 'bg-primary/15 text-white' : ''
              }`}
              style={{
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              <TrackCover
                coverUrl={track.coverUrl}
                title={getTrackDisplayName(track)}
                className="size-12 rounded"
              />
              <span className="min-w-0 self-center">
                <span className="block truncate text-sm font-medium">
                  {getTrackDisplayName(track)}
                </span>
                <TrackArtistLabel
                  track={track}
                  className="text-xs text-white/80"
                />
              </span>
            </button>
          )
        })}
      </div>
    </ScrollArea>
  )
}
