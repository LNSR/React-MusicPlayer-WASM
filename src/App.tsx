import { useShallow } from "zustand/react/shallow";
import {
  FolderOpen,
  Loader2,
  MoreHorizontal,
  Pause,
  Play,
  RotateCcw,
  Waves,
} from "lucide-react";
import { Toaster } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuGroup,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LibraryPanel } from "@/components/features/music/LibraryPanel";
import { MobileLibraryTabs } from "@/components/features/music/MobileLibraryTabs";
import { PlayerBar } from "@/components/features/music/PlayerBar";
import { SearchBox } from "@/components/features/music/SearchBox";
import { TrackCover } from "@/components/features/music/TrackCover";
import { TrackTable } from "@/components/features/music/TrackTable";
import { UnsupportedRuntime } from "@/components/features/music/UnsupportedRuntime";
import {
  formatTime,
  getTrackArtistLabel,
  getTrackDisplayName,
  MAX_LIBRARY_WIDTH,
  MIN_LIBRARY_WIDTH,
} from "@/lib/music-player";
import {
  useActiveTrack,
  useFilteredTracks,
} from "@/hooks/music-runtime/useMusicSelectors";
import {
  MusicRuntimeProvider,
  useMusicRuntimeContext,
} from "@/context/AppContext/useMusicRuntimeContext";
import { useMusicRuntime } from "@/hooks/useMusicRuntime";
import { useMusicAppStore } from "@/stores/useMusicAppStore";

export default function App() {
  const {
    capabilities,
    isSupported,
    layoutRef,
    loadTrack,
    pickFolder,
    playNext,
    playPrevious,
    seekTo,
    setVolume,
    togglePlayback,
    preloadTrackCovers,
    preloadTrackMetadata,
  } = useMusicRuntime();

  const { layoutMode, libraryWidth } = useMusicAppStore(
    useShallow((state) => ({
      layoutMode: state.platformUI.layoutMode,
      libraryWidth: state.libraryWidth,
    })),
  );
  const isDesktop = layoutMode === "desktop";
  const isCondensedLayout = !isDesktop;

  const runtimeContextValue = {
    capabilities,
    loadTrack,
    pickFolder,
    playNext,
    playPrevious,
    seekTo,
    setVolume,
    togglePlayback,
    preloadTrackCovers,
    preloadTrackMetadata,
  };

  const layoutClassName = `grid min-h-0 ${
    isCondensedLayout ? "grid-cols-1 gap-2" : "gap-0"
  }`;

  const layoutStyle = isCondensedLayout
    ? undefined
    : { gridTemplateColumns: `${libraryWidth}px 0.75rem minmax(0, 1fr)` };

  if (!isSupported) {
    return (
      <TooltipProvider>
        <UnsupportedRuntime />
        <Toaster richColors closeButton />
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <MusicRuntimeProvider value={runtimeContextValue}>
        <main className="h-svh overflow-hidden bg-background p-2 text-foreground">
          <div className="grid h-full grid-rows-[minmax(0,1fr)_auto] gap-2">
            <div
              ref={layoutRef}
              className={layoutClassName}
              style={layoutStyle}
            >
              {/* Desktop Sidebar */}
              {isDesktop && (
                <aside className="min-h-0 overflow-hidden rounded-lg bg-card/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                  <LibraryPanel />
                </aside>
              )}

              {isDesktop && <LibraryResizeHandle />}

              {/* Main Content Area */}
              <section className="min-h-0 overflow-hidden rounded-lg bg-card/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                <ScrollArea type="always" className="h-full">
                  <div className="min-h-full bg-[linear-gradient(180deg,oklch(0.43_0.16_17_/_0.52)_0,oklch(0.2_0.018_17_/_0.96)_18rem,var(--card)_30rem)]">
                    <MainHeader />
                    <PlaylistHero />

                    {/* Mobile Only Tabs */}
                    {isCondensedLayout && (
                      <section className="px-4 pb-2 sm:px-6">
                        <MobileLibraryTabs />
                      </section>
                    )}

                    {isDesktop && (
                      <section className="px-2 pb-8 sm:px-4">
                        <PlaylistActions />
                        <TrackTable />
                      </section>
                    )}
                  </div>
                </ScrollArea>
              </section>
            </div>

            <PlayerBar />
          </div>
        </main>
      </MusicRuntimeProvider>
      <Toaster richColors closeButton />
    </TooltipProvider>
  );
}

function LibraryResizeHandle() {
  const {
    isResizingLibrary,
    libraryWidth,
    setIsResizingLibrary,
    updateLibraryWidth,
  } = useMusicAppStore(
    useShallow((state) => ({
      isResizingLibrary: state.isResizingLibrary,
      libraryWidth: state.libraryWidth,
      setIsResizingLibrary: state.setIsResizingLibrary,
      updateLibraryWidth: state.updateLibraryWidth,
    })),
  );

  return (
    <button
      type="button"
      className="group flex min-h-0 cursor-col-resize items-stretch justify-center"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize library panel"
      aria-valuemin={MIN_LIBRARY_WIDTH}
      aria-valuemax={MAX_LIBRARY_WIDTH}
      aria-valuenow={Math.round(libraryWidth)}
      tabIndex={0}
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        setIsResizingLibrary(true);
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          updateLibraryWidth((width) =>
            Math.max(MIN_LIBRARY_WIDTH, width - 16),
          );
        }

        if (event.key === "ArrowRight") {
          event.preventDefault();
          updateLibraryWidth((width) =>
            Math.min(MAX_LIBRARY_WIDTH, width + 16),
          );
        }
      }}
    >
      <Separator
        orientation="vertical"
        decorative
        className={`my-2 w-1 rounded-full transition-colors ${
          isResizingLibrary
            ? "bg-primary"
            : "bg-white/10 group-hover:bg-primary/40"
        }`}
      />
    </button>
  );
}

function MainHeader() {
  const { isMobileLayout, platformLabel, searchQuery, setSearchQuery, status } =
    useMusicAppStore(
      useShallow((state) => ({
        isMobileLayout: state.platformUI.layoutMode === "mobile",
        platformLabel: state.platformUI.label,
        searchQuery: state.searchQuery,
        setSearchQuery: state.setSearchQuery,
        status: state.player.status,
      })),
    );
  const { pickFolder } = useMusicRuntimeContext();

  return (
    <header className="sticky top-0 z-10 flex flex-col gap-3 bg-card/40 px-4 py-3 backdrop-blur-md sm:px-6 md:flex-row md:items-center md:justify-between">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <div className="flex size-9 items-center justify-center rounded-full bg-primary/15">
          <Waves className="size-5 text-primary" />
        </div>
        <Badge variant="secondary">{status}</Badge>
        <Badge
          variant="outline"
          className="max-w-full border-white/10 text-white/70"
        >
          {platformLabel}
        </Badge>
      </div>
      <div className="flex w-full min-w-0 flex-wrap items-center gap-2 md:w-auto md:flex-nowrap">
        {!isMobileLayout && (
          <SearchBox
            value={searchQuery}
            onChange={setSearchQuery}
            className="min-w-48 flex-1 md:w-72 md:flex-none"
          />
        )}
        <Button
          onClick={() => void pickFolder()}
          disabled={status === "loading"}
          className="rounded-full"
        >
          {status === "loading" ? (
            <Loader2 className="animate-spin" />
          ) : (
            <FolderOpen />
          )}
          {isMobileLayout ? "Open" : "Open folder"}
        </Button>
      </div>
    </header>
  );
}

function PlaylistHero() {
  const activeTrack = useActiveTrack();
  const filteredTracks = useFilteredTracks();
  const { scanProgress, searchQuery, totalCount } = useMusicAppStore(
    useShallow((state) => ({
      scanProgress: state.scanProgress,
      searchQuery: state.searchQuery,
      totalCount: state.summary.supported,
    })),
  );

  return (
    <section className="flex flex-col gap-5 px-4 pb-6 pt-8 sm:px-6 md:flex-row md:flex-wrap md:items-end">
      <TrackCover
        coverUrl={activeTrack?.coverUrl}
        title={activeTrack ? getTrackDisplayName(activeTrack) : undefined}
        className="w-32 rounded-3xl shadow-2xl shadow-primary/15 sm:w-44 lg:w-52 xl:w-56"
      />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase text-white/80">
          Local playlist
        </p>
        <h1 className="music-wrap-text mt-2 max-w-5xl text-4xl font-black leading-tight tracking-normal sm:text-5xl lg:text-6xl">
          {activeTrack ? getTrackDisplayName(activeTrack) : "Local Files"}
        </h1>
        <p className="music-wrap-text mt-2 max-w-4xl text-sm font-medium text-white/80">
          {activeTrack ? getTrackArtistLabel(activeTrack) : "Unknown artist"}
        </p>
        <p className="music-wrap-text mt-3 max-w-5xl text-sm leading-6 text-white/70">
          {activeTrack?.relativePath ??
            (scanProgress ||
              "Choose a folder and play your local music library.")}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-white/70">
          <span className="font-semibold text-white">Music Player</span>
          <span>
            {searchQuery
              ? `${filteredTracks.length} of ${totalCount} songs`
              : `${totalCount} songs`}
          </span>
          {activeTrack?.duration ? (
            <span>{formatTime(activeTrack.duration)}</span>
          ) : null}
          <span>FFmpeg.wasm</span>
        </div>
      </div>
    </section>
  );
}

function PlaylistActions() {
  const { hasQueue, status } = useMusicAppStore(
    useShallow((state) => ({
      hasQueue: state.player.queue.length > 0,
      status: state.player.status,
    })),
  );
  const { seekTo, togglePlayback } = useMusicRuntimeContext();

  return (
    <div className="mb-4 flex items-center gap-3 px-2">
      <Button
        size="icon"
        className="size-14 rounded-full"
        onClick={() => void togglePlayback()}
        disabled={!hasQueue || status === "loading"}
        aria-label={status === "playing" ? "Pause" : "Play"}
      >
        {status === "loading" ? (
          <Loader2 className="animate-spin" />
        ) : status === "playing" ? (
          <Pause className="size-6" />
        ) : (
          <Play className="size-6" />
        )}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="More playlist actions"
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => seekTo([0])}>
              <RotateCcw className="size-4" />
              Restart track
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
