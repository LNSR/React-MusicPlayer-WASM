import { FFmpeg } from '@ffmpeg/ffmpeg'
import { getTrackDisplayName } from '@/lib/music-player'
import type {
  DecodeWorkerRequest,
  DecodeWorkerResponse,
  Track,
} from '@/types/audio'
import { loadFFMPEGWasmModule } from '@/lib/utils'

const ffmpeg = new FFmpeg()
const outputSampleRate = 48_000
let activeTrackId = ''
let ffmpegLoadPromise: Promise<void> | undefined
let ffmpegTaskChain: Promise<unknown> = Promise.resolve()

type LoadTrackRequest = Extract<DecodeWorkerRequest, { type: 'loadTrack' }>

function supportsMultithreadFfmpeg()
{
  return (
    import.meta.env.PROD &&
    self.crossOriginIsolated &&
    typeof SharedArrayBuffer !== 'undefined'
  )
}

async function resolveFfmpegCoreURLs()
{
  const thread = supportsMultithreadFfmpeg() ? 'multithread' : 'singlethread' as Parameters<typeof loadFFMPEGWasmModule>[ 0 ]
  return await loadFFMPEGWasmModule(thread)

}

function post(message: DecodeWorkerResponse, transfer?: Transferable[])
{
  if (transfer && transfer.length > 0)
  {
    self.postMessage(message, { transfer })
    return
  }

  self.postMessage(message)
}

function runFfmpegTask<T>(task: () => Promise<T>)
{
  const nextTask = ffmpegTaskChain.then(task, task)
  ffmpegTaskChain = nextTask.then(
    () => undefined,
    () => undefined,
  )
  return nextTask
}

function ensureFfmpeg()
{
  if (!ffmpegLoadPromise)
  {
    ffmpeg.on('log', ({ message }) =>
    {
      if (!activeTrackId)
      {
        return
      }

      post({
        type: 'decodeProgress',
        trackId: activeTrackId,
        message,
      })
    })
    ffmpeg.on('progress', ({ progress }) =>
    {
      if (!activeTrackId)
      {
        return
      }

      post({
        type: 'decodeProgress',
        trackId: activeTrackId,
        message: 'Decoding with FFmpeg.wasm',
        progress,
      })
    })

    ffmpegLoadPromise = (async () =>
    {
      const ffmpegCore = await resolveFfmpegCoreURLs()

      if (activeTrackId)
      {
        post({
          type: 'decodeProgress',
          trackId: activeTrackId,
          message: ffmpegCore.mode === 'multithread'
            ? 'Loading multithread FFmpeg.wasm core'
            : 'Loading FFmpeg.wasm core',
        })
      }

      await ffmpeg.load({
        coreURL: ffmpegCore.coreURL,
        wasmURL: ffmpegCore.wasmURL,
        ...(ffmpegCore.mode === 'multithread'
          ? { workerURL: ffmpegCore.workerURL }
          : {}),
      })
    })()
  }

  return ffmpegLoadPromise
}

function toSafeFfmpegName(track: Track)
{
  const safeId = track.id.replace(/[^a-zA-Z0-9_-]/g, '_')
  return `${safeId}.${track.format.toLowerCase()}`
}

function toSafeFfmpegStem(trackId: string)
{
  return trackId.replace(/[^a-zA-Z0-9_-]/g, '_')
}

function splitInterleavedStereo(pcm: Float32Array): [ Float32Array, Float32Array ]
{
  const frameCount = Math.floor(pcm.length / 2)
  const left = new Float32Array(frameCount)
  const right = new Float32Array(frameCount)

  for (let frame = 0; frame < frameCount; frame += 1)
  {
    left[ frame ] = pcm[ frame * 2 ] ?? 0
    const rightSample = pcm[ frame * 2 + 1 ]

    if (rightSample === undefined)
    {
      right[ frame ] = left[ frame ] ?? 0
    } else
    {
      right[ frame ] = rightSample
    }
  }

  return [ left, right ]
}

async function handleLoadTrack(message: LoadTrackRequest)
{
  const { track } = message
  const fileHandle = track.fileHandle

  if (!fileHandle)
  {
    post({
      type: 'decodeError',
      trackId: track.id,
      message: 'Track handle is no longer available. Rescan the folder.',
    })
    return
  }

  try
  {
    post({
      type: 'decodeProgress',
      trackId: track.id,
      message: `Decoding ${getTrackDisplayName(track)} with FFmpeg.wasm`,
    })

    const output = await runFfmpegTask(async () =>
    {
      activeTrackId = track.id
      await ensureFfmpeg()

      const file = await fileHandle.getFile()
      const inputPath = toSafeFfmpegName(track)
      const outputPath = `${toSafeFfmpegStem(track.id)}.f32`
      const buffer = new Uint8Array(await file.arrayBuffer())

      await ffmpeg.writeFile(inputPath, buffer)

      try
      {
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
      } finally
      {
        try
        {
          await ffmpeg.deleteFile(inputPath)
        } catch
        {
          // Ignore missing temp input files during cleanup.
        }

        try
        {
          await ffmpeg.deleteFile(outputPath)
        } catch
        {
          // Ignore missing temp output files during cleanup.
        }
      }
    })

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
    const duration = channelData[ 0 ].length / outputSampleRate

    post(
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
    post({
      type: 'decodeError',
      trackId: track.id,
      message:
        error instanceof Error ? error.message : 'Unable to load this track',
    })
  }
}

self.onmessage = async (event: MessageEvent<DecodeWorkerRequest>) =>
{
  const message = event.data

  if (message.type === 'setQueue')
  {
    return
  }

  if (message.type === 'seek')
  {
    return
  }

  if (message.type === 'loadTrack')
  {
    await handleLoadTrack(message)
  }
}

export { }