import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  getTrackArtistStatusLabel,
  isTrackArtistLoading,
} from '@/lib/music-player'
import type { Track } from '@/types/audio'

export function TrackArtistLabel({
  className,
  track,
}: {
  className?: string | undefined
  track: Pick<Track, 'artist' | 'artistStatus'>
}) {
  const loading = isTrackArtistLoading(track)

  return (
    <span className={cn('inline-flex max-w-full min-w-0 items-center gap-1.5', className)}>
      {loading ? <Loader2 className="size-3 shrink-0 animate-spin" /> : null}
      <span className="block min-w-0 flex-1 truncate">
        {getTrackArtistStatusLabel(track)}
      </span>
    </span>
  )
}
