import { pcmToChannels } from './pcm'
import type { FftProcessor } from '../wasm/pkg/fft_wasm'

export interface WebSocketFftOptions {
  /** FFT window size (default: 2048) */
  fftSize?: number
  /** Number of output frequency bands (default: 80) */
  bins?: number
  /** Lowest frequency in Hz (default: 100) */
  startFreq?: number
  /** Highest frequency in Hz (default: 18000) */
  endFreq?: number
  /**
   * Fraction of window overlap between successive FFT frames, 0–0.75 (default: 0).
   * With overlap 0.5 a new spectrum is produced every fftSize/2 samples,
   * halving update latency and smoothing bar motion at the cost of ~2x FFT compute.
   */
  overlap?: number
  /** Auto-reconnect with exponential backoff after an unexpected close (default: false) */
  autoReconnect?: boolean
  /** Called with fresh mono/left/right FFT magnitudes (0-255 per bin) each frame */
  onData?: (mono: Uint8Array, left: Uint8Array, right: Uint8Array) => void
  /** Called whenever the connection state changes */
  onConnectionChange?: (connected: boolean) => void
}

export interface WebSocketFftEngine {
  /** Latest mono-mix FFT magnitude data (0-255 per bin) */
  readonly fftData: Uint8Array
  /** Latest left-channel FFT magnitude data (0-255 per bin) */
  readonly fftDataLeft: Uint8Array
  /** Latest right-channel FFT magnitude data (0-255 per bin) */
  readonly fftDataRight: Uint8Array
  /** Whether the WebSocket is connected */
  readonly isConnected: boolean
  /** Connect to a WebSocket URL streaming PCM audio */
  connect: (url: string) => void
  /** Disconnect from the WebSocket */
  disconnect: () => void
  /** Process a Float32Array of PCM samples directly (for manual feeding) */
  processSamples: (samples: Float32Array) => void
  /** Tear down: disconnect and free WASM processors */
  free: () => void
}

/**
 * Framework-agnostic client-side FFT of a PCM WebSocket stream. Computes mono +
 * left + right spectra via the Rust WASM processor and surfaces them through
 * getters plus an `onData` callback — Vue's `useWebSocketFft` wraps this into refs.
 */
export function createWebSocketFft(options?: WebSocketFftOptions): WebSocketFftEngine {
  const fftSize = options?.fftSize ?? 2048
  const bins = options?.bins ?? 80
  const startFreq = options?.startFreq ?? 100
  const endFreq = options?.endFreq ?? 18000
  const overlap = Math.min(0.75, Math.max(0, options?.overlap ?? 0))
  const hopSize = Math.max(1, Math.round(fftSize * (1 - overlap)))
  const autoReconnect = options?.autoReconnect ?? false
  const onData = options?.onData
  const onConnectionChange = options?.onConnectionChange

  let fftData: Uint8Array = new Uint8Array(bins)
  let fftDataLeft: Uint8Array = new Uint8Array(bins)
  let fftDataRight: Uint8Array = new Uint8Array(bins)
  let isConnected = false

  let processor: FftProcessor | null = null
  let processorLeft: FftProcessor | null = null
  let processorRight: FftProcessor | null = null
  let websocket: WebSocket | null = null
  let sampleRate: number | null = null
  let configuredBitDepth = 16
  let configuredChannels = 2

  // Auto-reconnect state (exponential backoff)
  let reconnectAttempts = 0
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let lastUrl: string | null = null
  let reconnecting = false
  const RECONNECT_BASE_MS = 1000
  const RECONNECT_MAX_MS = 30000

  function setConnected(value: boolean) {
    if (isConnected === value) return
    isConnected = value
    onConnectionChange?.(value)
  }

  function scheduleReconnect() {
    if (!autoReconnect || !lastUrl) return
    if (reconnectTimer) clearTimeout(reconnectTimer)
    const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** reconnectAttempts)
    reconnectAttempts++
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      if (!lastUrl) return
      reconnecting = true
      connect(lastUrl)
      reconnecting = false
    }, delay)
  }

  // Accumulation buffers for partial frames (mono, left, right)
  let accumulationBuffer: Float32Array<ArrayBufferLike> = new Float32Array(0)
  let accumulationBufferLeft: Float32Array<ArrayBufferLike> = new Float32Array(0)
  let accumulationBufferRight: Float32Array<ArrayBufferLike> = new Float32Array(0)

  async function initProcessor(rate: number) {
    if (processor) { processor.free(); processor = null }
    if (processorLeft) { processorLeft.free(); processorLeft = null }
    if (processorRight) { processorRight.free(); processorRight = null }
    sampleRate = rate

    const wasmModule = await import('../wasm/pkg/fft_wasm')
    const { FftProcessor } = wasmModule
    processor = new FftProcessor(fftSize, bins, startFreq, endFreq, sampleRate)
    processorLeft = new FftProcessor(fftSize, bins, startFreq, endFreq, sampleRate)
    processorRight = new FftProcessor(fftSize, bins, startFreq, endFreq, sampleRate)
  }

  function processAccumulatedSamples() {
    if (!processor || !processorLeft || !processorRight) return

    while (accumulationBuffer.length >= fftSize
      && accumulationBufferLeft.length >= fftSize
      && accumulationBufferRight.length >= fftSize) {
      const frameMono = accumulationBuffer.slice(0, fftSize)
      const frameLeft = accumulationBufferLeft.slice(0, fftSize)
      const frameRight = accumulationBufferRight.slice(0, fftSize)
      // Advance by hopSize (= fftSize when overlap is 0) so successive
      // windows overlap by fftSize - hopSize samples
      accumulationBuffer = accumulationBuffer.slice(hopSize)
      accumulationBufferLeft = accumulationBufferLeft.slice(hopSize)
      accumulationBufferRight = accumulationBufferRight.slice(hopSize)
      fftData = processor.process(frameMono)
      fftDataLeft = processorLeft.process(frameLeft)
      fftDataRight = processorRight.process(frameRight)
      onData?.(fftData, fftDataLeft, fftDataRight)
    }
  }

  function processSamples(samples: Float32Array) {
    if (!processor) return

    // Append to accumulation buffer (mono only for backward compat)
    accumulationBuffer = appendToBuffer(accumulationBuffer, samples)
    // Also accumulate into L/R (same data when fed mono)
    accumulationBufferLeft = appendToBuffer(accumulationBufferLeft, samples)
    accumulationBufferRight = appendToBuffer(accumulationBufferRight, samples)

    processAccumulatedSamples()
  }

  function appendToBuffer(existing: Float32Array<ArrayBufferLike>, data: Float32Array<ArrayBufferLike>): Float32Array<ArrayBufferLike> {
    const newBuf = new Float32Array(existing.length + data.length)
    newBuf.set(existing)
    newBuf.set(data, existing.length)
    return newBuf
  }

  function connect(url: string) {
    if (!reconnecting) reconnectAttempts = 0
    lastUrl = url
    disconnect()

    websocket = new WebSocket(url)
    websocket.binaryType = 'arraybuffer'

    websocket.onopen = () => {
      setConnected(true)
      reconnectAttempts = 0
    }

    websocket.onmessage = async (event) => {
      const data = event.data

      // Handle config message
      if (typeof data === 'string') {
        try {
          const config = JSON.parse(data)
          if (config.type === 'config' && config.mode === 'pcm') {
            configuredBitDepth = config.bitDepth || 16
            configuredChannels = config.channels || 2
            await initProcessor(config.sampleRate || 48000)
          }
        } catch {
          // ignore non-JSON messages
        }
        return
      }

      // Handle binary PCM data
      if (data instanceof ArrayBuffer && processor) {
        const { mono, left, right } = pcmToChannels(data, configuredBitDepth, configuredChannels)
        accumulationBuffer = appendToBuffer(accumulationBuffer, mono)
        accumulationBufferLeft = appendToBuffer(accumulationBufferLeft, left)
        accumulationBufferRight = appendToBuffer(accumulationBufferRight, right)
        processAccumulatedSamples()
      }
    }

    websocket.onerror = () => {
      setConnected(false)
    }

    websocket.onclose = () => {
      setConnected(false)
      websocket = null
      // Only fires for unexpected closes — disconnect() nulls this handler first
      scheduleReconnect()
    }
  }

  function disconnect() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    if (websocket) {
      websocket.onopen = null
      websocket.onmessage = null
      websocket.onerror = null
      websocket.onclose = null
      websocket.close()
      websocket = null
    }
    setConnected(false)
    accumulationBuffer = new Float32Array(0)
    accumulationBufferLeft = new Float32Array(0)
    accumulationBufferRight = new Float32Array(0)
  }

  function free() {
    disconnect()
    if (processor) { processor.free(); processor = null }
    if (processorLeft) { processorLeft.free(); processorLeft = null }
    if (processorRight) { processorRight.free(); processorRight = null }
  }

  return {
    get fftData() { return fftData },
    get fftDataLeft() { return fftDataLeft },
    get fftDataRight() { return fftDataRight },
    get isConnected() { return isConnected },
    connect,
    disconnect,
    processSamples,
    free
  }
}
