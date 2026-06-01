import type { RefObject } from 'react'
import type { Remote } from 'comlink'
export type TrackFormat = 'MP3' | 'WAV' | 'FLAC' | 'OGG' | 'OPUS' | 'M4A' | 'AAC'

export interface Track
{
  id: string
  name: string
  artist?: string
  artistStatus?: 'loading' | 'loaded' | 'empty' | 'error'
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

export type PostToMetadataWorker = (message: MetadataWorkerRequest) => void
export type PostToDecodeWorker = (message: DecodeWorkerRequest) => void
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
    artist: string | null
  }
  | {
    type: 'trackMetadataFailed'
    trackId: string
    message: string
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

export type WorkerMessageHandler<Message> = (
  message: Message,
) => Promise<void> | void

export interface MetadataWorkerApi
{
  preloadCovers: (trackIds: string[]) => Promise<void>
  preloadTrackMetadata: (trackIds: string[]) => void
  scanDirectory: (directoryHandle: FileSystemDirectoryHandle) => Promise<void>
  setMessageHandler: (
    handler: WorkerMessageHandler<MetadataWorkerResponse> | undefined,
  ) => void
}

export interface DecodeWorkerApi
{
  loadTrack: (track: Track) => Promise<void>
  seek: (trackId: string, position: number) => void
  setMessageHandler: (
    handler: WorkerMessageHandler<DecodeWorkerResponse> | undefined,
  ) => void
  setQueue: (trackIds: string[]) => void
}

export interface WorkerClient<Api>
{
  api: Remote<Api>
  worker: Worker
}

export type MetadataWorkerRef = RefObject<
  WorkerClient<MetadataWorkerApi> | null
>
export type DecodeWorkerRef = RefObject<WorkerClient<DecodeWorkerApi> | null>

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
