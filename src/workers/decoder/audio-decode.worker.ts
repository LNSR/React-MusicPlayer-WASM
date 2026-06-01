import * as Comlink from 'comlink'
import { getTrackDisplayName } from '@/lib/music-player'
import type {
  DecodeWorkerApi,
  DecodeWorkerResponse,
  Track,
  WorkerMessageHandler,
} from '@/types/audio'
import { FfmpegManager } from '../shared/ffmpeg.manager'
import {
  toSafeFfmpegStem,
  toSafeTrackFfmpegName,
} from '../shared/file-system.utils'
import { outputSampleRate, splitInterleavedStereo } from './pcm-processor'

class AudioDecodeWorkerApp implements DecodeWorkerApi
{
  private activeTrackId = ''
  private messageHandler:
    | WorkerMessageHandler<DecodeWorkerResponse>
    | undefined
  private readonly ffmpegManager = new FfmpegManager({
    onLoadStart: (mode) =>
    {
      if (!this.activeTrackId)
      {
        return
      }

      this.post({
        type: 'decodeProgress',
        trackId: this.activeTrackId,
        message: mode === 'multithread'
          ? 'Loading multithread FFmpeg.wasm core'
          : 'Loading FFmpeg.wasm core',
      })
    },
    onLog: ({ message }) =>
    {
      if (!this.activeTrackId)
      {
        return
      }

      this.post({
        type: 'decodeProgress',
        trackId: this.activeTrackId,
        message,
      })
    },
    onProgress: ({ progress }) =>
    {
      if (!this.activeTrackId)
      {
        return
      }

      this.post({
        type: 'decodeProgress',
        trackId: this.activeTrackId,
        message: 'Decoding with FFmpeg.wasm',
        progress,
      })
    },
  })

  setMessageHandler(
    handler: WorkerMessageHandler<DecodeWorkerResponse> | undefined,
  )
  {
    this.messageHandler = handler
  }

  setQueue()
  {
    return undefined
  }

  seek()
  {
    return undefined
  }

  private post(message: DecodeWorkerResponse, transfer?: Transferable[])
  {
    if (!this.messageHandler)
    {
      return
    }

    if (transfer && transfer.length > 0)
    {
      void this.messageHandler(Comlink.transfer(message, transfer))
      return
    }

    void this.messageHandler(message)
  }

  private async decodeTrack(track: Track)
  {
    const fileHandle = track.fileHandle

    if (!fileHandle)
    {
      throw new Error('Track handle is no longer available. Rescan the folder.')
    }

    return await this.ffmpegManager.run(async (ffmpeg) =>
    {
      this.activeTrackId = track.id

      const file = await fileHandle.getFile()
      const inputPath = toSafeTrackFfmpegName(track)
      const outputPath = `${toSafeFfmpegStem(track.id)}.f32`
      const buffer = new Uint8Array(await file.arrayBuffer())

      await using inputFile = this.ffmpegManager.tempFile(inputPath)
      await using outputFile = this.ffmpegManager.tempFile(outputPath)
      void inputFile
      void outputFile
      await ffmpeg.writeFile(inputPath, buffer)

      const exitCode = await ffmpeg.exec([
        '-i',
        inputPath,
        '-vn',
        '-f',
        'f32le',
        '-acodec',
        'pcm_f32le',
        '-ac',
        '2',
        '-ar',
        outputSampleRate.toString(),
        outputPath,
      ])

      if (exitCode !== 0)
      {
        throw new Error(`FFmpeg exited with code ${exitCode}`)
      }

      return await ffmpeg.readFile(outputPath)
    })
  }

  async loadTrack(track: Track)
  {
    try
    {
      this.post({
        type: 'decodeProgress',
        trackId: track.id,
        message: `Decoding ${getTrackDisplayName(track)} with FFmpeg.wasm`,
      })

      const output = await this.decodeTrack(track)

      if (typeof output === 'string')
      {
        throw new Error('FFmpeg returned text instead of PCM data')
      }

      const pcmBytes = output.buffer.slice(
        output.byteOffset,
        output.byteOffset + output.byteLength,
      )
      const pcm = new Float32Array(pcmBytes)
      const channelData = splitInterleavedStereo(pcm)
      const duration = channelData[0].length / outputSampleRate

      this.post(
        {
          type: 'decodedTrack',
          trackId: track.id,
          sampleRate: outputSampleRate,
          channelData,
          duration,
          channelCount: 2,
        },
        channelData.map((channel) => channel.buffer),
      )
    } catch (error)
    {
      this.post({
        type: 'decodeError',
        trackId: track.id,
        message:
          error instanceof Error ? error.message : 'Unable to load this track',
      })
    }
  }

}

Comlink.expose(new AudioDecodeWorkerApp())

export { }
