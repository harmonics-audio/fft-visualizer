/**
 * Self-contained generative-audio demo for the playground / docs.
 *
 * Synthesizes a short evolving loop with the Web Audio API (no audio file, no
 * licensing), plays it audibly, and analyses it through the same Rust/WASM
 * FFT processor the component uses — so the visual matches `mode="local"`.
 *
 * Autoplay policy: start() must be called from a user gesture (a click).
 */

export interface DemoAudio {
  start: (onBins: (bins: Uint8Array) => void) => Promise<void>
  stop: () => void
}

const TEMPO = 128
const STEP = 60 / TEMPO / 2 // eighth-note seconds
// Chord roots per bar (A minor feel): Am, F, C, G
const ROOTS = [220.0, 174.61, 130.81, 196.0]
// Minor-pentatonic semitone offsets for the arpeggio
const PENTA = [0, 3, 5, 7, 10]
const semi = (n: number) => 2 ** (n / 12)

export function createDemoAudio(bins: number, fftSize = 2048): DemoAudio {
  let ctx: AudioContext | null = null
  let analyser: AnalyserNode | null = null
  let master: GainNode | null = null
  let filter: BiquadFilterNode | null = null
  let lfo: OscillatorNode | null = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let processor: any = null
  let noiseBuffer: AudioBuffer | null = null
  let buf: Float32Array | null = null
  let rafId: number | null = null
  let schedTimer: ReturnType<typeof setTimeout> | null = null
  let nextTime = 0
  let step = 0

  function pluck(freq: number, time: number, dur: number, type: OscillatorType, gain: number) {
    if (!ctx || !filter) return
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = type
    osc.frequency.value = freq
    g.gain.setValueAtTime(0, time)
    g.gain.linearRampToValueAtTime(gain, time + 0.008)
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur)
    osc.connect(g).connect(filter)
    osc.start(time)
    osc.stop(time + dur + 0.02)
  }

  function hat(time: number, gain: number) {
    if (!ctx || !master || !noiseBuffer) return
    const src = ctx.createBufferSource()
    src.buffer = noiseBuffer
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 7000
    const g = ctx.createGain()
    g.gain.setValueAtTime(gain, time)
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.05)
    src.connect(hp).connect(g).connect(master)
    src.start(time)
    src.stop(time + 0.06)
  }

  function scheduleStep(s: number, time: number) {
    const bar = Math.floor(s / 8) % ROOTS.length
    const beat = s % 8
    const root = ROOTS[bar]!

    // Bass on the downbeat and the "and" of 2
    if (beat === 0 || beat === 5) {
      pluck(root / 2, time, beat === 0 ? 0.5 : 0.3, 'sawtooth', 0.28)
    }
    // Arpeggio: walk the pentatonic, rising an octave every other bar
    const octave = 1 + ((Math.floor(s / 8) % 2) === 0 ? 0 : 1)
    const note = PENTA[s % PENTA.length]!
    pluck(root * semi(note) * octave, time, 0.28, 'triangle', 0.16)
    // Hi-hat on off-beats for treble sparkle
    if (beat % 2 === 1) hat(time, 0.12)
  }

  function scheduler() {
    if (!ctx) return
    while (nextTime < ctx.currentTime + 0.12) {
      scheduleStep(step, nextTime)
      nextTime += STEP
      step++
    }
    schedTimer = setTimeout(scheduler, 25)
  }

  function analyse(onBins: (bins: Uint8Array) => void) {
    if (!analyser || !processor || !buf) return
    analyser.getFloatTimeDomainData(buf)
    onBins(new Uint8Array(processor.process(buf)))
    rafId = requestAnimationFrame(() => analyse(onBins))
  }

  async function start(onBins: (bins: Uint8Array) => void) {
    stop()
    const { FftProcessor } = await import('../src/wasm')
    ctx = new AudioContext()
    await ctx.resume()

    master = ctx.createGain()
    master.gain.value = 0.22

    // Gentle lowpass swept by an LFO so the spectrum keeps moving
    filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 1400
    filter.Q.value = 6
    lfo = ctx.createOscillator()
    const lfoGain = ctx.createGain()
    lfo.frequency.value = 0.12
    lfoGain.gain.value = 1100
    lfo.connect(lfoGain).connect(filter.frequency)
    lfo.start()

    analyser = ctx.createAnalyser()
    analyser.fftSize = fftSize
    filter.connect(master)
    master.connect(analyser)
    master.connect(ctx.destination)

    // One second of white noise for the hi-hats
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
    const data = noiseBuffer.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1

    processor = new FftProcessor(fftSize, bins, 100, 18000, ctx.sampleRate)
    buf = new Float32Array(fftSize)

    nextTime = ctx.currentTime + 0.05
    step = 0
    scheduler()
    analyse(onBins)
  }

  function stop() {
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null }
    if (schedTimer !== null) { clearTimeout(schedTimer); schedTimer = null }
    if (lfo) { try { lfo.stop() } catch { /* already stopped */ } lfo = null }
    if (processor) { processor.free(); processor = null }
    if (ctx) { ctx.close(); ctx = null }
    analyser = null
    master = null
    filter = null
    noiseBuffer = null
    buf = null
  }

  return { start, stop }
}
