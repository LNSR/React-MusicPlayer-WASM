import type { RefObject } from 'react'
export type TrackFormat = 'MP3' | 'WAV' | 'FLAC' | 'OGG' | 'OPUS' | 'M4A' | 'AAC'

export interface Track
{
  id: string
  name: string
  artist?: string
  relativePath: string
  size: number
  lastModified: number
  format: TrackFormat
  duration?: number
  sampleRate?: number
  channelCount?: number
  coverUrl?: string | undefined
  fileHandle?: FileSystemFileHandle
}

export type PlayerStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'playing'
  | 'paused'
  | 'error'

export interface PlayerState
{
  status: PlayerStatus
  currentTrackId?: string
  queue: string[]
  position: number
  duration: number
  volume: number
  bufferedRanges: Array<[ number, number ]>
  error: string | undefined
}

export interface AudioRuntime
{
  context: AudioContext
  node: AudioWorkletNode
}

export interface CoverImage
{
  mimeType: string
  data: ArrayBuffer
}

export type AudioRuntimeRef = RefObject<AudioRuntime | null>
export type PendingAutoplayRef = RefObject<boolean>
export type WorkerRef = RefObject<Worker | null>

export type PostToMetadataWorker = (message: MetadataWorkerRequest) => void
export type PostToDecodeWorker = (message: DecodeWorkerRequest) => void
export type PostToWorker = (message: LibraryWorkerRequest) => void
export type UpdatePlayer = (updater: (player: PlayerState) => PlayerState) => void


export interface ScanSummary
{
  supported: number
  skipped: number
  directories: number
}

export type MetadataWorkerRequest =
  | {
    type: 'scanDirectory'
    directoryHandle: FileSystemDirectoryHandle
  }
  | { type: 'preloadCovers'; trackIds: string[] }
  | { type: 'preloadTrackMetadata'; trackIds: string[] }

export type DecodeWorkerRequest =
  | { type: 'loadTrack'; track: Track }
  | { type: 'setQueue'; trackIds: string[] }
  | { type: 'seek'; trackId: string; position: number }

export type LibraryWorkerRequest = MetadataWorkerRequest | DecodeWorkerRequest

export type MetadataWorkerResponse =
  | {
    type: 'scanProgress'
    scanned: number
    skipped: number
    directories: number
    currentPath: string
  }
  | { type: 'scanChunk'; tracks: Track[] }
  | { type: 'scanComplete'; summary: ScanSummary }
  | { type: 'scanError'; message: string }
  | {
    type: 'trackMetadataLoaded'
    trackId: string
    artist?: string
  }
  | {
    type: 'coverLoaded'
    trackId: string
    coverImage?: CoverImage
  }

export type DecodeWorkerResponse =
  | {
    type: 'decodeProgress'
    trackId: string
    message: string
    progress?: number
  }
  | {
    type: 'decodedTrack'
    trackId: string
    sampleRate: number
    channelData: Float32Array[]
    duration: number
    channelCount: number
    coverImage?: CoverImage
  }
  | { type: 'decodeError'; trackId?: string; message: string }

export type LibraryWorkerResponse = MetadataWorkerResponse | DecodeWorkerResponse

export type AudioWorkletRequest =
  | { type: 'initEngine' }
  | { type: 'clear' }
  | {
    type: 'loadPcm'
    trackId: string
    sampleRate: number
    channelData: Float32Array[]
    duration: number
  }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'seek'; position: number }
  | { type: 'setVolume'; volume: number }

export type AudioWorkletResponse =
  | { type: 'ready' }
  | { type: 'bufferStatus'; bufferedRanges: Array<[ number, number ]> }
  | { type: 'renderError'; message: string }
  | { type: 'ended' }
  | { type: 'positionUpdate'; position: number; levels: number[] }
