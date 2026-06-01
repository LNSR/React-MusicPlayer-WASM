import { Semaphore } from 'es-toolkit'

export type TaskPriority = 'normal' | 'high'

export async function runConcurrent<T>(
  items: T[],
  concurrency: number,
  task: (item: T) => Promise<void>,
)
{
  const semaphore = new Semaphore(Math.max(1, concurrency))

  await Promise.all(items.map(async (item) =>
  {
    await semaphore.acquire()

    try
    {
      await task(item)
    } finally
    {
      semaphore.release()
    }
  }))
}

export class PriorityTaskPool
{
  private activeCount = 0
  private readonly concurrency: number
  private queue: Array<() => void> = []

  constructor(concurrency: number)
  {
    this.concurrency = Math.max(1, concurrency)
  }

  clear()
  {
    this.queue = []
  }

  run<T>(task: () => Promise<T>, priority: TaskPriority = 'normal')
  {
    return new Promise<T>((resolve, reject) =>
    {
      const runTask = () =>
      {
        this.activeCount += 1
        task()
          .then(resolve, reject)
          .finally(() =>
          {
            this.activeCount -= 1
            this.drain()
          })
      }

      this.enqueue(runTask, priority)
      this.drain()
    })
  }

  private drain()
  {
    while (this.activeCount < this.concurrency)
    {
      const nextTask = this.queue.shift()

      if (!nextTask)
      {
        return
      }

      nextTask()
    }
  }

  private enqueue(task: () => void, priority: TaskPriority)
  {
    if (priority === 'high')
    {
      this.queue.unshift(task)
      return
    }

    this.queue.push(task)
  }
}

export class SerialPriorityTaskQueue
{
  private isRunning = false
  private queue: Array<() => void> = []

  clear()
  {
    this.queue = []
  }

  run<T>(task: () => Promise<T>, priority: TaskPriority = 'normal')
  {
    return new Promise<T>((resolve, reject) =>
    {
      const runTask = () =>
      {
        this.isRunning = true
        task()
          .then(resolve, reject)
          .finally(() =>
          {
            this.isRunning = false
            this.drain()
          })
      }

      this.enqueue(runTask, priority)
      this.drain()
    })
  }

  private drain()
  {
    if (this.isRunning)
    {
      return
    }

    const nextTask = this.queue.shift()

    if (nextTask)
    {
      nextTask()
    }
  }

  private enqueue(task: () => void, priority: TaskPriority)
  {
    if (priority === 'high')
    {
      this.queue.unshift(task)
      return
    }

    this.queue.push(task)
  }
}
