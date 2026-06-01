import { useRef } from 'react'
import { LRUCache } from 'lru-cache'
import { useMusicAppStore } from '@/stores/useMusicAppStore'

interface CoverImage {
  mimeType: string
  data: ArrayBuffer
}

export function useCoverUrls() {
  const coverUrlsRef = useRef<LRUCache<string, string> | null>(null)

  if (coverUrlsRef.current === null) {
    coverUrlsRef.current = new LRUCache<string, string>({
      max: 384,
      dispose: (coverUrl, trackId) => {
        URL.revokeObjectURL(coverUrl)

        const { patchTrack, tracks } = useMusicAppStore.getState()
        const track = tracks.find((candidate) => candidate.id === trackId)

        if (track?.coverUrl === coverUrl) {
          patchTrack(trackId, { coverUrl: undefined })
        }
      },
    })
  }

  const coverUrls = coverUrlsRef.current

  function applyCoverImage(trackId: string, coverImage?: CoverImage) {
    if (!coverImage) {
      return coverUrls.get(trackId)
    }

    const nextCoverUrl = URL.createObjectURL(
      new Blob([coverImage.data], { type: coverImage.mimeType }),
    )
    coverUrls.set(trackId, nextCoverUrl)
    return nextCoverUrl
  }

  function revokeAllCoverUrls() {
    coverUrls.clear()
  }

  return {
    applyCoverImage,
    revokeAllCoverUrls,
  }
}
