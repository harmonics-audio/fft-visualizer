import { ref, onUnmounted, type Ref } from 'vue'
import { createWebSocketFft, type WebSocketFftOptions } from 'fft-visualizer-core'

export type { WebSocketFftOptions }

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

/**
 * Vue wrapper around the framework-agnostic {@link createWebSocketFft} engine —
 * mirrors its spectra into refs and frees the WASM processors on unmount.
 */
export function useWebSocketFft(options?: WebSocketFftOptions): WebSocketFftReturn {
  const bins = options?.bins ?? 80
  const fftData = ref<Uint8Array>(new Uint8Array(bins))
  const fftDataLeft = ref<Uint8Array>(new Uint8Array(bins))
  const fftDataRight = ref<Uint8Array>(new Uint8Array(bins))
  const isConnected = ref(false)

  const engine = createWebSocketFft({
    ...options,
    onData: (mono, left, right) => {
      fftData.value = mono
      fftDataLeft.value = left
      fftDataRight.value = right
    },
    onConnectionChange: (connected) => { isConnected.value = connected }
  })

  onUnmounted(() => engine.free())

  return {
    fftData,
    fftDataLeft,
    fftDataRight,
    isConnected,
    connect: engine.connect,
    disconnect: engine.disconnect,
    processSamples: engine.processSamples
  }
}
