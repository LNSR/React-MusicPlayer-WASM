import { Music2 } from 'lucide-react'

interface TrackCoverProps {
  coverUrl?: string | undefined
  title?: string | undefined
  className?: string | undefined
}

export function TrackCover({ coverUrl, title, className }: TrackCoverProps) {
  return (
    <div
      className={`relative grid aspect-square min-w-0 max-w-full shrink-0 place-items-center overflow-hidden rounded-lg border bg-muted ${className ?? ''}`}
    >
      {coverUrl ? (
        <>
          <img
            src={coverUrl}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 size-1/2 scale-110 object-cover opacity-35 blur-xl"
          />
          <img
            src={coverUrl}
            alt={title ? `${title} cover` : 'Track cover'}
            className="relative z-10 max-h-full max-w-full object-contain"
          />
        </>
      ) : (
        <>
          <div className="absolute inset-0 bg-[linear-gradient(135deg,oklch(0.66_0.24_17_/_0.28),oklch(0.74_0.18_348_/_0.18))]" />
          <Music2 className="relative h-1/3 min-h-5 w-1/3 min-w-5 text-primary" />
        </>
      )}
    </div>
  )
}
