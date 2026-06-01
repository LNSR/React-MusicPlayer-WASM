import {
  Loader2,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useActiveTrack } from "@/hooks/music-runtime/useMusicSelectors";
import { useMusicRuntimeContext } from "@/context/AppContext/useMusicRuntimeContext";
import {
  formatTime,
  getTrackArtistStatusLabel,
  getTrackDisplayName,
  isTrackArtistLoading,
} from "@/lib/music-player";
import { useMusicAppStore } from "@/stores/useMusicAppStore";
import { useShallow } from "zustand/react/shallow";
import { TrackCover } from "./TrackCover";
import Marquee from "@/components/ui/text/marquee";

export function PlayerBar() {
  const track = useActiveTrack();
  const {
    compact,
    duration,
    position,
    queueLength,
    status,
    touchMode,
    volume,
  } = useMusicAppStore(
    useShallow((state) => ({
      compact: state.platformUI.layoutMode === "mobile",
      duration: state.player.duration,
      position: state.player.position,
      queueLength: state.player.queue.length,
      status: state.player.status,
      touchMode: state.platformUI.isTouch,
      volume: state.player.volume,
    })),
  );

  const volumePercentage = Math.round(volume * 100);
  const artistLabel = track ? getTrackArtistStatusLabel(track) : "";
  const artistLoading = track ? isTrackArtistLoading(track) : false;

  const { playNext, playPrevious, seekTo, setVolume, togglePlayback } =
    useMusicRuntimeContext();

  if (compact) {
    return (
      <footer className="rounded-2xl border border-white/10 bg-background p-3 shadow-[0_-10px_40px_rgba(0,0,0,0.38)]">
        <div className="grid min-w-0 grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-3">
          <TrackCover
            coverUrl={track?.coverUrl}
            title={track ? getTrackDisplayName(track) : undefined}
            className="size-14 rounded-xl"
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium leading-5 text-white">
              {track ? getTrackDisplayName(track) : "No track selected"}
            </p>
            {track ? (
              <span className="flex min-w-0 items-center gap-1.5 text-xs leading-4 text-white/70">
                {artistLoading ? (
                  <Loader2 className="size-3 shrink-0 animate-spin" />
                ) : null}
                <Marquee title={artistLabel}>{artistLabel}</Marquee>
              </span>
            ) : (
              <Marquee className="text-xs leading-4 text-white/70">
                {`${queueLength} tracks in library`}
              </Marquee>
            )}
          </div>
          <Badge variant="outline" className="border-white/10 text-white/70">
            {Math.round(volume * 100)}%
          </Badge>
        </div>
        <div className="mt-3 grid grid-cols-[2.75rem_1fr_2.75rem] items-center gap-2">
          <span className="text-right text-xs text-muted-foreground">
            {formatTime(position)}
          </span>
          <Slider
            value={[Math.min(position, duration || 0)]}
            max={Math.max(duration, 1)}
            step={0.1}
            disabled={!track}
            onValueChange={seekTo}
            aria-label="Seek"
          />
          <span className="text-xs text-muted-foreground">
            {formatTime(duration)}
          </span>
        </div>
        <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center">
          <Button
            variant="ghost"
            size="icon"
            onClick={playPrevious}
            disabled={!queueLength}
            aria-label="Previous track"
            className="justify-self-end rounded-full"
          >
            <SkipBack />
          </Button>
          <Button
            size="icon"
            className={`mx-3 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 ${
              touchMode ? "size-12" : "size-11"
            }`}
            onClick={() => void togglePlayback()}
            disabled={!queueLength || status === "loading"}
            aria-label={status === "playing" ? "Pause" : "Play"}
          >
            {status === "loading" ? (
              <Loader2 className="animate-spin" />
            ) : status === "playing" ? (
              <Pause className="fill-current" />
            ) : (
              <Play className="fill-current" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={playNext}
            disabled={!queueLength}
            aria-label="Next track"
            className="justify-self-start rounded-full"
          >
            <SkipForward />
          </Button>
        </div>
      </footer>
    );
  }

  return (
    <footer className="grid min-h-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 bg-background p-2 md:grid-cols-[minmax(10rem,1fr)_minmax(16rem,2fr)_minmax(8rem,1fr)] lg:grid-cols-[minmax(12rem,1fr)_minmax(18rem,2fr)_minmax(10rem,1fr)]">
      <div className="grid min-w-0 grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-3">
        <TrackCover
          coverUrl={track?.coverUrl}
          title={track ? getTrackDisplayName(track) : undefined}
          className="size-14 rounded"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium leading-5 text-white">
            {track ? getTrackDisplayName(track) : "No track selected"}
          </p>
          {track ? (
            <span className="flex min-w-0 items-center gap-1.5 text-xs leading-4 text-white/70">
              {artistLoading ? (
                <Loader2 className="size-3 shrink-0 animate-spin" />
              ) : null}
              <Marquee title={artistLabel}>{artistLabel}</Marquee>
            </span>
          ) : (
            <Marquee className="text-xs leading-4 text-white/70">
              {`${queueLength} tracks in library`}
            </Marquee>
          )}
        </div>
      </div>

      <div className="hidden min-w-0 flex-col items-center gap-2 md:flex">
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={playPrevious}
                disabled={!queueLength}
                aria-label="Previous track"
              >
                <SkipBack />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Previous</TooltipContent>
          </Tooltip>
          <Button
            size="icon"
            className="size-9 rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => void togglePlayback()}
            disabled={!queueLength || status === "loading"}
            aria-label={status === "playing" ? "Pause" : "Play"}
          >
            {status === "loading" ? (
              <Loader2 className="animate-spin" />
            ) : status === "playing" ? (
              <Pause className="fill-current" />
            ) : (
              <Play className="fill-current" />
            )}
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={playNext}
                disabled={!queueLength}
                aria-label="Next track"
              >
                <SkipForward />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Next</TooltipContent>
          </Tooltip>
        </div>
        <div className="grid w-full grid-cols-[2.75rem_1fr_2.75rem] items-center gap-2">
          <span className="text-right text-xs text-muted-foreground">
            {formatTime(position)}
          </span>
          <Slider
            value={[Math.min(position, duration || 0)]}
            max={Math.max(duration, 1)}
            step={0.1}
            disabled={!track}
            onValueChange={seekTo}
            aria-label="Seek"
          />
          <span className="text-xs text-muted-foreground">
            {formatTime(duration)}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        <div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
          <span>{volumePercentage}%</span>
          <Volume2 className="size-4" />
          <Slider
            value={[volume]}
            min={0}
            max={1}
            step={0.01}
            onValueChange={setVolume}
            className="w-24"
            aria-label="Volume"
          />
        </div>
        <Button
          size="icon"
          className="rounded-full md:hidden"
          onClick={() => void togglePlayback()}
          disabled={!queueLength || status === "loading"}
          aria-label={status === "playing" ? "Pause" : "Play"}
        >
          {status === "playing" ? <Pause /> : <Play />}
        </Button>
      </div>
    </footer>
  );
}
