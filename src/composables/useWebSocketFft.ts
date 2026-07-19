import { ref, onUnmounted, type Ref } from 'vue'
import { pcmToChannels } from '../pcm'
import type { FftProcessor } from '../../wasm/pkg/fft_wasm'

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
}

export interface WebSocketFftReturn {
  /** Reactive FFT magnitude data (0-255 per bin) — mono mix */
  fftData: Ref<Uint8Array>
  /** Reactive FFT magnitude data for left channel (0-255 per bin) */
  fftDataLeft: Ref<Uint8Array>
  /** Reactive FFT magnitude data for right channel (0-255 per bin) */
  fftDataRight: Ref<Uint8Array>
  /** Whether the WebSocket is connected */
  isConnected: Ref<boolean>
  /** Connect to a WebSocket URL streaming PCM audio */
  connect: (url: string) => void
  /** Disconnect from the WebSocket */
  disconnect: () => void
  /** Process a Float32Array of PCM samples directly (for manual feeding) */
  processSamples: (samples: Float32Array) => void
}

export function useWebSocketFft(options?: WebSocketFftOptions): WebSocketFftReturn {
  const fftSize = options?.fftSize ?? 2048
  const bins = options?.bins ?? 80
  const startFreq = options?.startFreq ?? 100
  const endFreq = options?.endFreq ?? 18000
  const overlap = Math.min(0.75, Math.max(0, options?.overlap ?? 0))
  const hopSize = Math.max(1, Math.round(fftSize * (1 - overlap)))

  const fftData = ref<Uint8Array>(new Uint8Array(bins))
  const fftDataLeft = ref<Uint8Array>(new Uint8Array(bins))
  const fftDataRight = ref<Uint8Array>(new Uint8Array(bins))
  const isConnected = ref(false)

  let processor: FftProcessor | null = null
  let processorLeft: FftProcessor | null = null
  let processorRight: FftProcessor | null = null
  let websocket: WebSocket | null = null
  let sampleRate: number | null = null
  let configuredBitDepth: number = 16
  let configuredChannels: number = 2

  // Accumulation buffers for partial frames (mono, left, right)
  let accumulationBuffer: Float32Array<ArrayBufferLike> = new Float32Array(0)
  let accumulationBufferLeft: Float32Array<ArrayBufferLike> = new Float32Array(0)
  let accumulationBufferRight: Float32Array<ArrayBufferLike> = new Float32Array(0)

  async function initProcessor(rate: number) {
    if (processor) { processor.free(); processor = null }
    if (processorLeft) { processorLeft.free(); processorLeft = null }
    if (processorRight) { processorRight.free(); processorRight = null }
    sampleRate = rate

    const wasmModule = await import('../../wasm/pkg/fft_wasm')
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
      fftData.value = processor.process(frameMono)
      fftDataLeft.value = processorLeft.process(frameLeft)
      fftDataRight.value = processorRight.process(frameRight)
    }
  }

  function processSamples(samples: Float32Array) {
    if (!processor) return

    // Append to accumulation buffer (mono only for backward compat)
    const newBuffer = new Float32Array(accumulationBuffer.length + samples.length)
    newBuffer.set(accumulationBuffer)
    newBuffer.set(samples, accumulationBuffer.length)
    accumulationBuffer = newBuffer

    // Also accumulate into L/R (same data when fed mono)
    const newLeft = new Float32Array(accumulationBufferLeft.length + samples.length)
    newLeft.set(accumulationBufferLeft)
    newLeft.set(samples, accumulationBufferLeft.length)
    accumulationBufferLeft = newLeft

    const newRight = new Float32Array(accumulationBufferRight.length + samples.length)
    newRight.set(accumulationBufferRight)
    newRight.set(samples, accumulationBufferRight.length)
    accumulationBufferRight = newRight

    processAccumulatedSamples()
  }

  function appendToBuffer(existing: Float32Array<ArrayBufferLike>, data: Float32Array<ArrayBufferLike>): Float32Array<ArrayBufferLike> {
    const newBuf = new Float32Array(existing.length + data.length)
    newBuf.set(existing)
    newBuf.set(data, existing.length)
    return newBuf
  }

  function connect(url: string) {
    disconnect()

    websocket = new WebSocket(url)
    websocket.binaryType = 'arraybuffer'

    websocket.onopen = () => {
      isConnected.value = true
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
      isConnected.value = false
    }

    websocket.onclose = () => {
      isConnected.value = false
      websocket = null
    }
  }

  function disconnect() {
    if (websocket) {
      websocket.onopen = null
      websocket.onmessage = null
      websocket.onerror = null
      websocket.onclose = null
      websocket.close()
      websocket = null
    }
    isConnected.value = false
    accumulationBuffer = new Float32Array(0)
    accumulationBufferLeft = new Float32Array(0)
    accumulationBufferRight = new Float32Array(0)
  }

  function cleanup() {
    disconnect()
    if (processor) { processor.free(); processor = null }
    if (processorLeft) { processorLeft.free(); processorLeft = null }
    if (processorRight) { processorRight.free(); processorRight = null }
  }

  onUnmounted(cleanup)

  return { fftData, fftDataLeft, fftDataRight, isConnected, connect, disconnect, processSamples }
}
