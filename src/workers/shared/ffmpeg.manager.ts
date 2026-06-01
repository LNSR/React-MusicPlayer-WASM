import { FFmpeg } from '@ffmpeg/ffmpeg'
import { loadFFMPEGWasmModule } from '@/lib/utils'
import {
  SerialPriorityTaskQueue,
  type TaskPriority,
} from './concurrency.utils'

export type FfmpegTaskPriority = TaskPriority

type FfmpegCoreMode = Awaited<ReturnType<typeof loadFFMPEGWasmModule>>['mode']

interface FfmpegManagerOptions
{
  debug?: boolean
  onLog?: (log: { message: string }) => void
  onProgress?: (progress: { progress: number }) => void
  onLoadStart?: (mode: FfmpegCoreMode) => void
}

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
  const thread = supportsMultithreadFfmpeg()
    ? 'multithread'
    : 'singlethread' as Parameters<typeof loadFFMPEGWasmModule>[0]

  return await loadFFMPEGWasmModule(thread)
}

export class FfmpegManager
{
  private readonly ffmpeg = new FFmpeg()
  private readonly options: FfmpegManagerOptions
  private readonly taskQueue = new SerialPriorityTaskQueue()
  private loadPromise: Promise<void> | undefined
  private listenersAttached = false

  constructor(options: FfmpegManagerOptions = {})
  {
    this.options = options
  }

  clearQueuedTasks()
  {
    this.taskQueue.clear()
  }

  async deleteFile(path: string)
  {
    try
    {
      await this.ffmpeg.deleteFile(path)
    } catch
    {
      // Temp files are best-effort cleanup; FFmpeg may already have removed them.
    }
  }

  tempFile(path: string): AsyncDisposable
  {
    return {
      [Symbol.asyncDispose]: async () =>
      {
        await this.deleteFile(path)
      },
    }
  }

  run<T>(
    task: (ffmpeg: FFmpeg) => Promise<T>,
    priority: FfmpegTaskPriority = 'normal',
  )
  {
    return this.taskQueue.run(async () =>
    {
      await this.ensureLoaded()
      return await task(this.ffmpeg)
    }, priority)
  }

  private ensureLoaded()
  {
    if (!this.loadPromise)
    {
      this.attachListeners()
      this.loadPromise = (async () =>
      {
        const ffmpegCore = await resolveFfmpegCoreURLs()
        this.options.onLoadStart?.(ffmpegCore.mode)

        if (this.options.debug)
        {
          console.debug('[ffmpeg.manager] loading core', {
            mode: ffmpegCore.mode,
          })
        }

        await this.ffmpeg.load({
          coreURL: ffmpegCore.coreURL,
          wasmURL: ffmpegCore.wasmURL,
          ...(ffmpegCore.mode === 'multithread'
            ? { workerURL: ffmpegCore.workerURL }
            : {}),
        })
      })()
    }

    return this.loadPromise
  }

  private attachListeners()
  {
    if (this.listenersAttached)
    {
      return
    }

    this.listenersAttached = true

    if (this.options.onLog)
    {
      this.ffmpeg.on('log', this.options.onLog)
    }

    if (this.options.onProgress)
    {
      this.ffmpeg.on('progress', this.options.onProgress)
    }
  }
}
