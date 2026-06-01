import { AlertTriangle, FolderOpen, ListMusic, Loader2 } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  formatTime,
  getTrackDisplayName,
  getVisualizerBars,
} from '@/lib/music-player'
import {
  useActiveTrack,
  useLibraryFilteredTracks,
  useQueuedTracks,
} from '@/hooks/music-runtime/useMusicSelectors'
import { useMusicRuntimeContext } from '@/context/AppContext/useMusicRuntimeContext'
import { useMusicAppStore } from '@/stores/useMusicAppStore'
import { LibraryStat, MiniLibrary } from './LibraryPanel'
import { SearchBox } from './SearchBox'
import { TrackArtistLabel } from './TrackArtistLabel'
import { TrackCover } from './TrackCover'

export function MobileLibraryTabs() {
  const tracks = useLibraryFilteredTracks()
  const {
    activeTrackId,
    librarySearchQuery,
    loading,
    setLibrarySearchQuery,
    summary,
  } =
    useMusicAppStore(
      useShallow((state) => ({
        activeTrackId: state.player.currentTrackId,
        librarySearchQuery: state.librarySearchQuery,
        loading: state.player.status === 'loading',
        setLibrarySearchQuery: state.setLibrarySearchQuery,
        summary: state.summary,
      })),
    )
  const { loadTrack, pickFolder } = useMusicRuntimeContext()

  return (
    <Tabs defaultValue="library" className="w-full">
      <TabsList className="grid h-11 w-full grid-cols-2 bg-secondary/60">
        <TabsTrigger value="library">Library</TabsTrigger>
        <TabsTrigger value="queue">Now Playing</TabsTrigger>
      </TabsList>
      <TabsContent value="library" className="mt-3">
        <div className="music-shell-muted-strong p-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <ListMusic className="size-4 text-primary" />
              Library snapshot
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void pickFolder()}
              disabled={loading}
              className="rounded-full"
            >
              {loading ? <Loader2 className="animate-spin" /> : <FolderOpen />}
              Refresh
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <LibraryStat label="Tracks" value={summary.supported} />
            <LibraryStat label="Skipped" value={summary.skipped} />
            <LibraryStat label="Folders" value={summary.directories} />
          </div>
          <SearchBox
            value={librarySearchQuery}
            onChange={setLibrarySearchQuery}
            className="mt-3 h-9"
          />
          <div className="mt-3 h-72">
            <MiniLibrary
              tracks={tracks}
              activeTrackId={activeTrackId}
              onPlay={(trackId) => void loadTrack(trackId, true)}
              className="h-full"
            />
          </div>
        </div>
      </TabsContent>
      <TabsContent value="queue" className="mt-3">
        <MobileNowPlayingCard />
      </TabsContent>
    </Tabs>
  )
}

function MobileNowPlayingCard() {
  const track = useActiveTrack()
  const queuedTracks = useQueuedTracks()
  const { error, levels, scanProgress, status } = useMusicAppStore(
    useShallow((state) => ({
      error: state.player.error,
      levels: state.levels,
      scanProgress: state.scanProgress,
      status: state.player.status,
    })),
  )
  const { loadTrack } = useMusicRuntimeContext()
  const bars = getVisualizerBars(levels, status, 18)
  const upcomingTracks = queuedTracks.filter((queuedTrack) => queuedTrack.id !== track?.id)

  return (
    <div className="music-shell-muted-strong p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/45">
            Now Playing
          </p>
          <h3 className="music-wrap-text mt-2 text-lg font-bold leading-snug text-white">
            {track ? getTrackDisplayName(track) : 'No track loaded'}
          </h3>
          {track ? (
            <TrackArtistLabel
              track={track}
              className="mt-1 text-sm text-primary/90"
            />
          ) : (
            <p className="music-wrap-text mt-1 text-sm text-primary/90">
              No artist loaded
            </p>
          )}
        </div>
        <Badge variant={status === 'error' ? 'warning' : 'secondary'}>
          {status}
        </Badge>
      </div>
      <div className="mt-4 flex items-center gap-4">
        <TrackCover
          coverUrl={track?.coverUrl}
          title={track ? getTrackDisplayName(track) : undefined}
          className="w-24 rounded-xl shadow-lg shadow-primary/15 sm:w-28 md:w-32"
        />
        <div className="min-w-0 flex-1">
          <p className="music-clamp-3 music-wrap-text text-sm leading-5 text-white/80">
            {track?.relativePath ?? 'Pick a folder and choose a track.'}
          </p>
          {error ? (
            <p className="music-wrap-text mt-2 flex items-start gap-2 text-sm text-amber-200">
              <AlertTriangle className="size-4" />
              {error}
            </p>
          ) : scanProgress ? (
            <p className="music-wrap-text mt-2 text-sm text-muted-foreground">
              {scanProgress}
            </p>
          ) : null}
        </div>
      </div>
      <div className="mt-4 flex h-14 items-end gap-1 rounded-xl bg-background/45 p-3">
        {bars.map((height, index) => (
          <span
            key={index}
            className="wave-bar flex-1 rounded-t-sm bg-primary/80"
            style={{
              height: `${height}%`,
              animationDelay: `${index * 34}ms`,
              animationPlayState: status === 'playing' ? 'running' : 'paused',
            }}
          />
        ))}
      </div>
      <div className="mt-4 space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-white">Up next</h4>
          <span className="text-xs text-muted-foreground">
            {upcomingTracks.length} queued
          </span>
        </div>
        {upcomingTracks.length ? (
          upcomingTracks.slice(0, 4).map((queuedTrack) => (
            <button
              key={queuedTrack.id}
              type="button"
              onClick={() => void loadTrack(queuedTrack.id, true)}
              className="music-queue-row"
            >
              <TrackCover
                coverUrl={queuedTrack.coverUrl}
                title={getTrackDisplayName(queuedTrack)}
                className="size-10 rounded"
              />
              <span className="min-w-0">
                <span className="block truncate text-sm text-white">
                  {getTrackDisplayName(queuedTrack)}
                </span>
                <TrackArtistLabel
                  track={queuedTrack}
                  className="text-xs text-white/80"
                />
              </span>
              <span className="text-xs text-muted-foreground">
                {queuedTrack.duration ? formatTime(queuedTrack.duration) : '--:--'}
              </span>
            </button>
          ))
        ) : (
          <div className="music-shell-soft px-3 py-4 text-sm text-muted-foreground">
            Queue will appear here once you start playback.
          </div>
        )}
      </div>
    </div>
  )
}
