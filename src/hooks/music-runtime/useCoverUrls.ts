import { useRef } from 'react'

interface CoverImage {
  mimeType: string
  data: ArrayBuffer
}

export function useCoverUrls() {
  const coverUrlsRef = useRef<Map<string, string> | null>(null)

  if (coverUrlsRef.current === null) {
    coverUrlsRef.current = new Map<string, string>()
  }

  const coverUrls = coverUrlsRef.current

  function applyCoverImage(trackId: string, coverImage?: CoverImage) {
    const existingCoverUrl = coverUrls.get(trackId)

    if (!coverImage) {
      return existingCoverUrl
    }

    if (existingCoverUrl) {
      URL.revokeObjectURL(existingCoverUrl)
    }

    const nextCoverUrl = URL.createObjectURL(
      new Blob([coverImage.data], { type: coverImage.mimeType }),
    )
    coverUrls.set(trackId, nextCoverUrl)
    return nextCoverUrl
  }

  function revokeAllCoverUrls() {
    for (const coverUrl of coverUrls.values()) {
      URL.revokeObjectURL(coverUrl)
    }
    coverUrls.clear()
  }

  return {
    applyCoverImage,
    revokeAllCoverUrls,
  }
}
