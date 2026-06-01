import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { toBlobURL } from '@ffmpeg/util'

export function cn(...inputs: ClassValue[])
{
  return twMerge(clsx(inputs))
}

export async function loadFFMPEGWasmModule(thread: "singlethread" | "multithread" = "singlethread")
{
  if (thread === "singlethread")
  {
    const [
      { default: coreURL },
      { default: wasmURL },
    ] = await Promise.all([
      import('@ffmpeg/core?url'),
      import('@ffmpeg/core/wasm?url'),
    ])

    const [ resolvedCoreURL, resolvedWasmURL ] = await Promise.all([
      toBlobURL(coreURL, 'text/javascript'),
      toBlobURL(wasmURL, 'application/wasm'),
    ])

    return {
      coreURL: resolvedCoreURL,
      wasmURL: resolvedWasmURL,
      mode: thread,
    } as const
  }

  const [
    { default: mtCoreURL },
    { default: mtWasmURL },
    { default: mtWorkerURL },
  ] = await Promise.all([
    import('@ffmpeg/core-mt?url'),
    import('@ffmpeg/core-mt/wasm?url'),
    import('@ffmpeg/core-mt/worker?url'),
  ])
  const [ resolvedCoreURL, resolvedWasmURL, resolvedWorkerURL ] =
    await Promise.all([
      toBlobURL(mtCoreURL, 'text/javascript'),
      toBlobURL(mtWasmURL, 'application/wasm'),
      toBlobURL(mtWorkerURL, 'text/javascript'),
    ])

  return {
    coreURL: resolvedCoreURL,
    wasmURL: resolvedWasmURL,
    workerURL: resolvedWorkerURL,
    mode: thread,
  } as const
}