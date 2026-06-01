export interface WorkerSessionView
{
  id: number
  label: string
  signal: AbortSignal
  isCurrent: () => boolean
  throwIfAborted: () => void
}

export function isAbortError(error: unknown)
{
  return error instanceof DOMException && error.name === 'AbortError'
}

export class ProgressReporter<Snapshot>
{
  private frame = 0
  private hasSnapshot = false
  private latestPath = ''
  private readonly getSnapshot: (currentPath: string) => Snapshot
  private readonly intervalMs: number
  private lastPostTime = 0
  private readonly post: (snapshot: Snapshot) => void
  private readonly signal: AbortSignal

  constructor({
    getSnapshot,
    intervalMs = 100,
    post,
    signal,
  }: {
    getSnapshot: (currentPath: string) => Snapshot
    intervalMs?: number
    post: (snapshot: Snapshot) => void
    signal: AbortSignal
  })
  {
    this.getSnapshot = getSnapshot
    this.intervalMs = intervalMs
    this.post = post
    this.signal = signal
  }

  cancel()
  {
    if (this.frame !== 0)
    {
      self.clearTimeout(this.frame)
      this.frame = 0
    }
  }

  [Symbol.dispose]()
  {
    this.cancel()
  }

  flush()
  {
    this.cancel()
    this.publish()
  }

  mark(currentPath: string)
  {
    if (this.signal.aborted)
    {
      return
    }

    this.latestPath = currentPath
    this.hasSnapshot = true
    const elapsed = performance.now() - this.lastPostTime

    if (elapsed >= this.intervalMs)
    {
      this.publish()
      return
    }

    if (this.frame !== 0)
    {
      return
    }

    this.frame = self.setTimeout(() =>
    {
      this.frame = 0
      this.publish()
    }, this.intervalMs - elapsed)
  }

  private publish()
  {
    if (this.signal.aborted || !this.hasSnapshot)
    {
      return
    }

    this.lastPostTime = performance.now()
    this.post(this.getSnapshot(this.latestPath))
  }
}

export class WorkerSession
{
  private controller: AbortController | undefined
  private currentId = 0
  private readonly resetCallbacks: Array<() => void> = []

  abort()
  {
    this.controller?.abort()
  }

  current()
  {
    const controller = this.controller

    if (!controller)
    {
      return undefined
    }

    return this.createView(this.currentId, 'current', controller)
  }

  onReset(callback: () => void)
  {
    this.resetCallbacks.push(callback)
  }

  reset()
  {
    for (const callback of this.resetCallbacks)
    {
      callback()
    }
  }

  start(label: string)
  {
    this.abort()
    this.reset()
    this.currentId += 1
    this.controller = new AbortController()
    return this.createView(this.currentId, label, this.controller)
  }

  private createView(
    id: number,
    label: string,
    controller: AbortController,
  ): WorkerSessionView
  {
    const { signal } = controller

    return {
      id,
      label,
      signal,
      isCurrent: () => this.controller === controller && !signal.aborted,
      throwIfAborted: () =>
      {
        if (this.controller !== controller || signal.aborted)
        {
          throw new DOMException('Worker session was aborted', 'AbortError')
        }
      },
    }
  }
}
