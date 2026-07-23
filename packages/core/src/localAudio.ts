import type { FftProcessor } from '../wasm/pkg/fft_wasm'

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
  /** Called with fresh FFT magnitudes (0-255 per bin) on every animation frame */
  onData?: (data: Uint8Array) => void
  /** Called whenever isActive / devices / activeDeviceId / sourceType changes */
  onStateChange?: () => void
}

export interface LocalAudioEngine {
  /** Latest FFT magnitude data (0-255 per bin) */
  readonly fftData: Uint8Array
  /** Whether local audio capture is active */
  readonly isActive: boolean
  /** Current audio source type */
  readonly sourceType: AudioSourceType
  /** Available audio input devices (populated after getDevices or start) */
  readonly devices: AudioDevice[]
  /** Currently active device ID */
  readonly activeDeviceId: string | undefined
  /** Enumerate available audio input devices (requests mic permission if needed) */
  getDevices: () => Promise<AudioDevice[]>
  /** Start audio capture from microphone */
  start: (deviceId?: string) => Promise<void>
  /** Start audio capture from system/tab audio via screen sharing */
  startDisplay: () => Promise<void>
  /** Stop audio capture */
  stop: () => void
}

/**
 * Framework-agnostic microphone / system-audio capture that computes FFT
 * magnitudes in-browser via the Rust WASM processor. State is surfaced through
 * getters plus `onData` / `onStateChange` callbacks — Vue's `useLocalAudio`
 * wraps this into refs.
 */
export function createLocalAudio(options?: LocalAudioOptions): LocalAudioEngine {
  const fftSize = options?.fftSize ?? 2048
  const bins = options?.bins ?? 80
  const startFreq = options?.startFreq ?? 100
  const endFreq = options?.endFreq ?? 18000
  const onData = options?.onData
  const onStateChange = options?.onStateChange

  let fftData: Uint8Array = new Uint8Array(bins)
  let isActive = false
  let sourceType: AudioSourceType = 'mic'
  let devices: AudioDevice[] = []
  let activeDeviceId: string | undefined = options?.deviceId

  let audioContext: AudioContext | null = null
  let mediaStream: MediaStream | null = null
  let sourceNode: MediaStreamAudioSourceNode | null = null
  let analyserNode: AnalyserNode | null = null
  let animationFrameId: number | null = null
  let processor: FftProcessor | null = null
  let timeDomainBuffer: Float32Array<ArrayBuffer> | null = null

  function notify() {
    onStateChange?.()
  }

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
    devices = result
    notify()
    return result
  }

  function tick() {
    if (!analyserNode || !processor || !timeDomainBuffer) return

    analyserNode.getFloatTimeDomainData(timeDomainBuffer)
    const result = processor.process(timeDomainBuffer)
    fftData = result
    onData?.(result)

    animationFrameId = requestAnimationFrame(tick)
  }

  async function initProcessing(stream: MediaStream) {
    // Lazy-load WASM module
    const wasmModule = await import('../wasm/pkg/fft_wasm')
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
    isActive = true
    notify()
    animationFrameId = requestAnimationFrame(tick)
  }

  async function start(deviceId?: string) {
    if (isActive) stop()

    const selectedDeviceId = deviceId ?? activeDeviceId

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
    activeDeviceId = audioTrack?.getSettings().deviceId
    sourceType = 'mic'

    // Refresh device list (now we have permission, labels will be populated)
    devices = await enumerateAudioDevices()
    notify()

    await initProcessing(stream)
  }

  async function startDisplay() {
    if (isActive) stop()

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

    activeDeviceId = undefined
    sourceType = 'display'
    notify()

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
    isActive = false
    fftData = new Uint8Array(bins)
    notify()
  }

  return {
    get fftData() { return fftData },
    get isActive() { return isActive },
    get sourceType() { return sourceType },
    get devices() { return devices },
    get activeDeviceId() { return activeDeviceId },
    getDevices,
    start,
    startDisplay,
    stop
  }
}
