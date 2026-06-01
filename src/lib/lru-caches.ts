import { LRUCache } from 'lru-cache'

export interface TrackRequestCache {
  add: (trackId: string) => void
  clear: () => void
  has: (trackId: string) => boolean
}

export function createTrackRequestCache(max = 500): TrackRequestCache {
  const cache = new LRUCache<string, true>({ max })

  return {
    add: (trackId) => {
      cache.set(trackId, true)
    },
    clear: () => {
      cache.clear()
    },
    has: (trackId) => cache.has(trackId),
  }
}
