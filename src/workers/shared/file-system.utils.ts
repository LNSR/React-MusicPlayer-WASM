import type { Track, TrackFormat } from '@/types/audio'

const audioExtensions = new Map<string, TrackFormat>([
  ['mp3', 'MP3'],
  ['wav', 'WAV'],
  ['flac', 'FLAC'],
  ['ogg', 'OGG'],
  ['opus', 'OPUS'],
  ['m4a', 'M4A'],
  ['aac', 'AAC'],
])

const coverMimeTypes = new Map<string, string>([
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
  ['png', 'image/png'],
  ['webp', 'image/webp'],
])

export function createTrackId(relativePath: string, file: File)
{
  return `${relativePath}:${file.size}:${file.lastModified}`
}

export function getCoverMimeType(name: string)
{
  const extension = name.split('.').pop()?.toLowerCase()
  return extension ? coverMimeTypes.get(extension) : undefined
}

export function getFormat(name: string): TrackFormat | undefined
{
  const extension = name.split('.').pop()?.toLowerCase()
  return extension ? audioExtensions.get(extension) : undefined
}

export async function getSortedEntries(
  directoryHandle: FileSystemDirectoryHandle,
)
{
  const entries: FileSystemHandle[] = []

  for await (const [, handle] of directoryHandle.entries())
  {
    entries.push(handle)
  }

  entries.sort((first, second) =>
    first.name.localeCompare(second.name, undefined, {
      sensitivity: 'base',
    }),
  )

  return entries
}

export function toSafeFfmpegName(trackId: string, format: TrackFormat)
{
  const safeId = toSafeFfmpegStem(trackId)
  return `${safeId}.${format.toLowerCase()}`
}

export function toSafeTrackFfmpegName(track: Track)
{
  return toSafeFfmpegName(track.id, track.format)
}

export function toSafeFfmpegStem(trackId: string)
{
  return trackId.replace(/[^a-zA-Z0-9_-]/g, '_')
}
