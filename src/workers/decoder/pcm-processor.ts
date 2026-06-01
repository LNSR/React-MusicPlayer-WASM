export const outputSampleRate = 48_000

export function splitInterleavedStereo(
  pcm: Float32Array,
): [Float32Array, Float32Array]
{
  const frameCount = Math.floor(pcm.length / 2)
  const left = new Float32Array(frameCount)
  const right = new Float32Array(frameCount)

  for (let frame = 0; frame < frameCount; frame += 1)
  {
    left[frame] = pcm[frame * 2] ?? 0
    const rightSample = pcm[frame * 2 + 1]

    if (rightSample === undefined)
    {
      right[frame] = left[frame] ?? 0
    } else
    {
      right[frame] = rightSample
    }
  }

  return [left, right]
}
