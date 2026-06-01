import type {
  AudioWorkletRequest,
  AudioWorkletResponse,
} from '@/types/audio'

declare const sampleRate: number

declare abstract class AudioWorkletProcessor {
  readonly port: MessagePort

  constructor()

  abstract process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean
}

type AudioWorkletProcessorConstructor = new () => AudioWorkletProcessor

declare function registerProcessor(
  name: string,
  processorCtor: AudioWorkletProcessorConstructor,
): void

class MusicPlayerProcessor extends AudioWorkletProcessor {
  private channels: Float32Array[] = []
  private sourceSampleRate = sampleRate
  private position = 0
  private duration = 0
  private playing = false
  private volume = 0.85
  private frameCounter = 0
  private levels: [number, number] = [0, 0]
  private endedPosted = false

  constructor() {
    super()

    this.port.onmessage = (event: MessageEvent<AudioWorkletRequest>) => {
      const message = event.data

      if (message.type === 'initEngine') {
        this.post({ type: 'ready' })
        return
      }

      if (message.type === 'clear') {
        this.channels = []
        this.position = 0
        this.duration = 0
        this.playing = false
        this.levels = [0, 0]
        this.endedPosted = false
        this.post({
          type: 'bufferStatus',
          bufferedRanges: [],
        })
        return
      }

      if (message.type === 'loadPcm') {
        this.channels = message.channelData
        this.sourceSampleRate = message.sampleRate
        this.duration = message.duration
        this.position = 0
        this.playing = false
        this.endedPosted = false
        this.post({
          type: 'bufferStatus',
          bufferedRanges: [[0, message.duration]],
        })
        return
      }

      if (message.type === 'play') {
        if (this.channels.length && this.position < this.duration) {
          this.playing = true
          this.endedPosted = false
        }
        return
      }

      if (message.type === 'pause') {
        this.playing = false
        return
      }

      if (message.type === 'seek') {
        this.position = Math.max(0, Math.min(message.position, this.duration))
        this.endedPosted = this.position >= this.duration
        return
      }

      if (message.type === 'setVolume') {
        this.volume = Math.max(0, Math.min(1, message.volume))
      }
    }
  }

  private post(message: AudioWorkletResponse) {
    this.port.postMessage(message)
  }

  private fillSilence(left: Float32Array, right: Float32Array) {
    left.fill(0)

    if (right === left) {
      return
    }

    right.fill(0)
  }

  override process(_inputs: Float32Array[][], outputs: Float32Array[][]) {
    const output = outputs[0]
    const left = output?.[0]

    if (!output || !left) {
      return true
    }

    const right = output[1] ?? left

    if (!this.channels.length || !this.playing) {
      this.fillSilence(left, right)
      return true
    }

    const leftChannel = this.channels[0]

    if (!leftChannel) {
      this.fillSilence(left, right)
      return true
    }

    const rightChannel = this.channels[1] ?? leftChannel
    const sourceLength = leftChannel.length
    const ratio = this.sourceSampleRate / sampleRate
    let leftPeak = 0
    let rightPeak = 0

    for (let frame = 0; frame < left.length; frame += 1) {
      const sourceIndex = Math.floor(this.position * this.sourceSampleRate)

      if (sourceIndex >= sourceLength) {
        left[frame] = 0
        right[frame] = 0
        this.playing = false
        this.position = this.duration
        if (!this.endedPosted) {
          this.endedPosted = true
          this.post({ type: 'ended' })
        }
        continue
      }

      const lSource = leftChannel[sourceIndex] ?? 0
      const rSource = rightChannel[sourceIndex] ?? lSource
      const lSample = lSource * this.volume
      const rSample = rSource * this.volume

      left[frame] = lSample
      right[frame] = rSample
      leftPeak = Math.max(leftPeak, Math.abs(lSample))
      rightPeak = Math.max(rightPeak, Math.abs(rSample))
      this.position += ratio / this.sourceSampleRate
    }

    this.levels[0] = Math.max(this.levels[0] * 0.82, leftPeak)
    this.levels[1] = Math.max(this.levels[1] * 0.82, rightPeak)
    this.frameCounter += 1

    if (this.frameCounter % 24 === 0) {
      this.post({
        type: 'positionUpdate',
        position: this.position,
        levels: this.levels,
      })
    }

    return true
  }
}

registerProcessor('music-player', MusicPlayerProcessor)
