import { ref, type Ref } from 'vue'
import type { FftProcessor } from '../../wasm/pkg/fft_wasm'

export type AudioSourceType = 'mic' | 'display'

export interface AudioDevice {
  deviceId: string
  label: string
}

export interface LocalAudioOptions {
  /** FFT window size (default: 2048) */
  fftSize?: number
  /** Number of output frequency bands (default: 80) */
  bins?: number
  /** Lowest frequency in Hz (default: 100) */
  startFreq?: number
  /** Highest frequency in Hz (default: 18000) */
  endFreq?: number
  /** Audio input device ID (default: system default) */
  deviceId?: string
}

export interface LocalAudioReturn {
  /** Reactive FFT magnitude data (0-255 per bin) */
  fftData: Ref<Uint8Array>
  /** Whether local audio capture is active */
  isActive: Ref<boolean>
  /** Current audio source type */
  sourceType: Ref<AudioSourceType>
  /** Available audio input devices (populated after getDevices or start) */
  devices: Ref<AudioDevice[]>
  /** Currently active device ID */
  activeDeviceId: Ref<string | undefined>
  /** Enumerate available audio input devices (requests mic permission if needed) */
  getDevices: () => Promise<AudioDevice[]>
  /** Start audio capture from microphone */
  start: (deviceId?: string) => Promise<void>
  /** Start audio capture from system/tab audio via screen sharing */
  startDisplay: () => Promise<void>
  /** Stop audio capture */
  stop: () => void
}

export function useLocalAudio(options?: LocalAudioOptions): LocalAudioReturn {
  const fftSize = options?.fftSize ?? 2048
  const bins = options?.bins ?? 80
  const startFreq = options?.startFreq ?? 100
  const endFreq = options?.endFreq ?? 18000

  const fftData = ref<Uint8Array>(new Uint8Array(bins))
  const isActive = ref(false)
  const sourceType = ref<AudioSourceType>('mic')
  const devices = ref<AudioDevice[]>([])
  const activeDeviceId = ref<string | undefined>(options?.deviceId)

  let audioContext: AudioContext | null = null
  let mediaStream: MediaStream | null = null
  let sourceNode: MediaStreamAudioSourceNode | null = null
  let analyserNode: AnalyserNode | null = null
  let animationFrameId: number | null = null
  let processor: FftProcessor | null = null
  let timeDomainBuffer: Float32Array<ArrayBuffer> | null = null

  async function enumerateAudioDevices(): Promise<AudioDevice[]> {
    const allDevices = await navigator.mediaDevices.enumerateDevices()
    return allDevices
      .filter(d => d.kind === 'audioinput')
      .map(d => ({ deviceId: d.deviceId, label: d.label || `Microphone (${d.deviceId.slice(0, 8)})` }))
  }

  async function getDevices(): Promise<AudioDevice[]> {
    // Request temporary mic permission to get labeled device list
    const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const result = await enumerateAudioDevices()
    tempStream.getTracks().forEach(track => track.stop())
    devices.value = result
    return result
  }

  function tick() {
    if (!analyserNode || !processor || !timeDomainBuffer) return

    analyserNode.getFloatTimeDomainData(timeDomainBuffer)
    const result = processor.process(timeDomainBuffer)
    fftData.value = result

    animationFrameId = requestAnimationFrame(tick)
  }

  async function initProcessing(stream: MediaStream) {
    // Lazy-load WASM module
    const wasmModule = await import('../../wasm/pkg/fft_wasm')
    const { FftProcessor } = wasmModule

    mediaStream = stream

    audioContext = new AudioContext()
    sourceNode = audioContext.createMediaStreamSource(mediaStream)

    analyserNode = audioContext.createAnalyser()
    analyserNode.fftSize = fftSize
    sourceNode.connect(analyserNode)

    processor = new FftProcessor(
      fftSize,
      bins,
      startFreq,
      endFreq,
      audioContext.sampleRate
    )

    timeDomainBuffer = new Float32Array(fftSize)
    isActive.value = true
    animationFrameId = requestAnimationFrame(tick)
  }

  async function start(deviceId?: string) {
    if (isActive.value) stop()

    const selectedDeviceId = deviceId ?? activeDeviceId.value

    const audioConstraints: MediaTrackConstraints = {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false
    }
    if (selectedDeviceId) {
      audioConstraints.deviceId = { exact: selectedDeviceId }
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints })

    // Track which device we're actually using
    const audioTrack = stream.getAudioTracks()[0]
    activeDeviceId.value = audioTrack?.getSettings().deviceId
    sourceType.value = 'mic'

    // Refresh device list (now we have permission, labels will be populated)
    devices.value = await enumerateAudioDevices()

    await initProcessing(stream)
  }

  async function startDisplay() {
    if (isActive.value) stop()

    const stream = await navigator.mediaDevices.getDisplayMedia({
      audio: true,
      video: true // required by some browsers, we just ignore the video track
    })

    // Remove video track — we only need audio
    stream.getVideoTracks().forEach(track => track.stop())

    // Handle user stopping the share via browser UI
    stream.getAudioTracks()[0]?.addEventListener('ended', () => {
      stop()
    })

    activeDeviceId.value = undefined
    sourceType.value = 'display'

    await initProcessing(stream)
  }

  function stop() {
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId)
      animationFrameId = null
    }

    if (processor) {
      processor.free()
      processor = null
    }

    if (sourceNode) {
      sourceNode.disconnect()
      sourceNode = null
    }

    if (audioContext) {
      audioContext.close()
      audioContext = null
    }

    if (mediaStream) {
      mediaStream.getTracks().forEach(track => track.stop())
      mediaStream = null
    }

    analyserNode = null
    timeDomainBuffer = null
    isActive.value = false
    fftData.value = new Uint8Array(bins)
  }

  return { fftData, isActive, sourceType, devices, activeDeviceId, getDevices, start, startDisplay, stop }
}
