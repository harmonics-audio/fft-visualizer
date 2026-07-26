// The radio source's client half: play the proxied stream through an <audio>
// element and analyse its LEFT and RIGHT channels with the same Rust/WASM FFT the
// visualizer uses locally, so the playground gets real, genuinely-stereo data
// without a microphone or a WebSocket server.
//
// Plain functions over callbacks, no framework: the core, Vue, React and Nuxt
// playgrounds all drive this identically, feeding what comes back straight into
// `feedData(mono, left, right)` with the visualizer in `external` mode.
//
// Not built on core's `createLocalAudio`, which is mono by design (one analyser,
// no channel splitter) and takes a MediaStream rather than a media element.
// Widening that public API for a playground-only feature would be the wrong
// trade; this is a demo of the `external` mode, which is exactly the seam a
// consumer would use for their own source.
import type { FftProcessor } from '@fft-visualizer/core/wasm'
import { RADIO_PROXY_PATH } from './radioStream'

// SomaFM is listener-supported and asks for attribution — every playground shows
// the station name and a support link while the radio source is selected.
export const SOMA = {
  name: 'Groove Salad Classic',
  station: 'https://somafm.com/gsclassic/',
  support: 'https://somafm.com/support/'
}

/** Frame callback: 0-255 magnitudes, one entry per bin. Buffers are reused. */
export type RadioFrameHandler = (mono: Uint8Array, left: Uint8Array, right: Uint8Array) => void

export interface RadioAudio {
  /** Must be called from a user gesture — autoplay policy blocks it otherwise. */
  start: (onFrame: RadioFrameHandler) => Promise<void>
  stop: () => void
}

// 80 bins regardless of the `bands` setting, matching what a WebSocket server
// would send: the visualizer maps however many bins it receives onto the bands it
// is currently drawing, so changing Bands needs no restart here.
const BINS = 80
const FFT_SIZE = 2048

export function createRadioAudio(): RadioAudio {
  let ctx: AudioContext | null = null
  let audioEl: HTMLAudioElement | null = null
  let analyserL: AnalyserNode | null = null
  let analyserR: AnalyserNode | null = null
  let procL: FftProcessor | null = null
  let procR: FftProcessor | null = null
  let bufL: Float32Array<ArrayBuffer> | null = null
  let bufR: Float32Array<ArrayBuffer> | null = null
  let rafId: number | null = null
  const mono = new Uint8Array(BINS)

  function analyse(onFrame: RadioFrameHandler) {
    if (!analyserL || !analyserR || !procL || !procR || !bufL || !bufR) return
    analyserL.getFloatTimeDomainData(bufL)
    analyserR.getFloatTimeDomainData(bufR)
    const left = procL.process(bufL)
    const right = procR.process(bufR)
    for (let i = 0; i < BINS; i++) mono[i] = (left[i]! + right[i]!) >> 1
    onFrame(mono, left, right)
    rafId = requestAnimationFrame(() => analyse(onFrame))
  }

  async function start(onFrame: RadioFrameHandler) {
    stop()

    // Kick the stream off before awaiting the WASM import so it buffers while
    // that loads. Same-origin via the proxy, so no crossOrigin and no tainting.
    audioEl = new Audio()
    audioEl.preload = 'auto'
    audioEl.src = RADIO_PROXY_PATH

    const { FftProcessor } = await import('@fft-visualizer/core/wasm')

    ctx = new AudioContext()
    await ctx.resume()

    const source = ctx.createMediaElementSource(audioEl)
    source.connect(ctx.destination) // audible

    const splitter = ctx.createChannelSplitter(2)
    source.connect(splitter)
    analyserL = ctx.createAnalyser()
    analyserR = ctx.createAnalyser()
    analyserL.fftSize = FFT_SIZE
    analyserR.fftSize = FFT_SIZE
    splitter.connect(analyserL, 0)
    splitter.connect(analyserR, 1)

    procL = new FftProcessor(FFT_SIZE, BINS, 100, 18000, ctx.sampleRate)
    procR = new FftProcessor(FFT_SIZE, BINS, 100, 18000, ctx.sampleRate)
    bufL = new Float32Array(FFT_SIZE)
    bufR = new Float32Array(FFT_SIZE)

    // Deliberately not awaited: play() can reject for reasons the visualizer
    // recovers from on its own (a slow first chunk), and the bars simply stay
    // flat until audio flows rather than the whole source failing to start.
    void audioEl.play().catch(() => {})
    analyse(onFrame)
  }

  function stop() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
    if (procL) { procL.free(); procL = null }
    if (procR) { procR.free(); procR = null }
    if (audioEl) {
      // removeAttribute + load(): pause() alone leaves the connection open and
      // the proxy streaming.
      audioEl.pause()
      audioEl.removeAttribute('src')
      audioEl.load()
      audioEl = null
    }
    if (ctx) { void ctx.close(); ctx = null }
    analyserL = null
    analyserR = null
    bufL = null
    bufR = null
    mono.fill(0)
  }

  return { start, stop }
}
