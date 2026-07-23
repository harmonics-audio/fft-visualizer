<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import {
  FFTVisualizer as FFTVisualizerCore,
  type FFTVisualizerOptions,
  type AudioDevice,
  type GradientInput
} from 'fft-visualizer-core'

/**
 * FFT Visualizer — thin Vue wrapper around the framework-agnostic
 * {@link FFTVisualizerCore} WebGL renderer. Props map straight onto the core's
 * options; the core owns all rendering, audio, and WebSocket logic.
 *
 * Supports three modes:
 * - 'websocket': receives pre-computed FFT data via WebSocket (default)
 * - 'local': captures audio from mic/system and computes FFT in-browser via Rust WASM
 * - 'external': receives externally provided FFT data via props
 */

const props = withDefaults(defineProps<{
  /** Data source mode */
  mode?: 'websocket' | 'local' | 'external'
  /** WebSocket URL (required when mode='websocket') */
  websocketUrl?: string
  /** External FFT data (mono or combined) - Uint8Array of frequency magnitudes (0-255) */
  data?: Uint8Array
  /** External FFT data for left channel (stereo mode) */
  dataLeft?: Uint8Array
  /** External FFT data for right channel (stereo mode) */
  dataRight?: Uint8Array
  /** Audio source type for local mode */
  audioSource?: 'mic' | 'display'
  /** Audio input device ID for local mode */
  audioDeviceId?: string
  /** Show peak indicators above bars */
  showPeaks?: boolean
  /** Peak decay rate (0.99 = slow decay, 0.9 = fast decay) */
  peakDecay?: number
  /** Number of frequency bands to display */
  bands?: 10 | 20 | 40 | 80
  /** Enable LED segment effect */
  ledBars?: boolean
  /** LED look: 'segment' = fixed-pixel horizontal segments (consistent at every resolution); 'meter' = short, wide segments sized from bar width, like a classic LED meter (spacing varies with bands/size) */
  ledShape?: 'segment' | 'meter'
  /** Full-height bars whose brightness follows the level */
  lumiBars?: boolean
  /** Render the spectrum as a circle (angle = frequency, radius = level) */
  radial?: boolean
  /** Radial mode: inner hole radius as a fraction of the outer radius (0-0.9) */
  radialInnerRadius?: number
  /** Gap between bars as a fraction of bar width (0 = none, max 0.9) */
  barSpace?: number
  /** Mirrored reflection (0 = off). Linear mono: fraction of canvas height (max 0.7). Radial: any value > 0 mirrors the bars inward inside the inner circle */
  reflexRatio?: number
  /** Brightness of the reflection (0-1) */
  reflexAlpha?: number
  /** Glow above the bar tops (0 = off, 1 = max) */
  glow?: number
  /** Rotate the whole visual clockwise, in degrees */
  rotation?: 0 | 90 | 180 | 270
  /** Bar color gradient: preset name (see gradientPresets) or custom stops */
  gradient?: GradientInput
  /** Gradient direction */
  gradientDirection?: 'vertical' | 'horizontal'
  /** 'gradient' paints along the gradient axis; 'bar-level' colors each whole bar by its current level */
  colorMode?: 'gradient' | 'bar-level'
  /** Noise floor threshold (0-255) */
  noiseFloor?: number
  /** Temporal smoothing factor (0 = none, 0.9 = heavy) */
  smoothing?: number
  /** Enable stereo mode (left channel top, right channel bottom) */
  stereo?: boolean
  /** Background color behind and between the bars (any solid CSS color) */
  background?: string
  /** Show the small connection/fps stats overlay in the corner */
  showStats?: boolean
  /** Auto-reconnect the WebSocket with exponential backoff after an unexpected drop (mode='websocket') */
  autoReconnect?: boolean
  /** Log connection/config diagnostics to the console */
  debug?: boolean
}>(), {
  mode: 'websocket',
  showPeaks: true,
  peakDecay: 0.997,
  bands: 80,
  ledBars: false,
  ledShape: 'segment',
  lumiBars: false,
  radial: false,
  radialInnerRadius: 0.35,
  barSpace: 0.25,
  reflexRatio: 0,
  reflexAlpha: 0.25,
  glow: 0,
  rotation: 0,
  gradient: 'classic',
  gradientDirection: 'vertical',
  colorMode: 'gradient',
  noiseFloor: 0,
  smoothing: 0,
  stereo: false,
  background: '#0a0a0a',
  showStats: true,
  autoReconnect: false,
  debug: false
})

const emit = defineEmits<{
  connected: []
  disconnected: []
  error: [error: string]
  // Fired once per processed audio frame with the display bar magnitudes (0-255),
  // one entry per bar (`bands`). In mono modes `left`/`right` are null; in stereo
  // `data` is the per-bar max of both channels and `left`/`right` carry each side.
  frame: [data: Uint8Array, left: Uint8Array | null, right: Uint8Array | null]
}>()

const canvasRef = ref<HTMLCanvasElement>()
const isConnected = ref(false)
const fps = ref(0)
const audioDevices = ref<AudioDevice[]>([])
const activeAudioDeviceId = ref<string | undefined>()
const displayBins = computed(() => props.bands)

let viz: FFTVisualizerCore | null = null
let fpsTimer: ReturnType<typeof setInterval> | null = null

// Core options built from props. Gradient is handled by its own deep watch so it
// can react to in-place mutation of custom stops, so it's excluded from the
// bulk-update object below.
function buildOptions(includeGradient: boolean): FFTVisualizerOptions {
  const opts: FFTVisualizerOptions = {
    mode: props.mode,
    websocketUrl: props.websocketUrl,
    data: props.data,
    dataLeft: props.dataLeft,
    dataRight: props.dataRight,
    audioSource: props.audioSource,
    audioDeviceId: props.audioDeviceId,
    showPeaks: props.showPeaks,
    peakDecay: props.peakDecay,
    bands: props.bands,
    ledBars: props.ledBars,
    ledShape: props.ledShape,
    lumiBars: props.lumiBars,
    radial: props.radial,
    radialInnerRadius: props.radialInnerRadius,
    barSpace: props.barSpace,
    reflexRatio: props.reflexRatio,
    reflexAlpha: props.reflexAlpha,
    glow: props.glow,
    rotation: props.rotation,
    gradientDirection: props.gradientDirection,
    colorMode: props.colorMode,
    noiseFloor: props.noiseFloor,
    smoothing: props.smoothing,
    stereo: props.stereo,
    background: props.background,
    autoReconnect: props.autoReconnect,
    debug: props.debug
  }
  if (includeGradient) opts.gradient = props.gradient
  return opts
}

onMounted(() => {
  const canvas = canvasRef.value
  if (!canvas) return

  viz = new FFTVisualizerCore(canvas, buildOptions(true))

  viz.on('connected', () => { isConnected.value = true; emit('connected') })
  viz.on('disconnected', () => { isConnected.value = false; emit('disconnected') })
  viz.on('error', (msg) => emit('error', msg))
  viz.on('frame', ({ data, left, right }) => emit('frame', data, left, right))
  viz.on('audiostate', () => {
    audioDevices.value = viz!.audioDevices
    activeAudioDeviceId.value = viz!.activeAudioDeviceId
  })

  isConnected.value = viz.isConnected

  // Poll the core's FPS counter for the stats overlay (updated once per second)
  fpsTimer = setInterval(() => { if (viz) fps.value = viz.fps }, 500)

  // Bulk-forward prop changes to the core (per-key diffing lives in setOptions)
  watch(() => buildOptions(false), (opts) => viz?.setOptions(opts))

  // Gradient: deep-watch so mutating a custom stops array in place still reloads.
  watch(() => props.gradient, (g) => {
    viz?.setOptions({ gradient: g })
    viz?.refreshGradient()
  }, { deep: true })
})

onUnmounted(() => {
  if (fpsTimer) { clearInterval(fpsTimer); fpsTimer = null }
  viz?.destroy()
  viz = null
})

function connect() { viz?.connect() }
function disconnect() { viz?.disconnect() }
function feedData(data: Uint8Array, left?: Uint8Array, right?: Uint8Array) {
  viz?.feedData(data, left, right)
}
function getAudioDevices(): Promise<AudioDevice[]> {
  return viz ? viz.getAudioDevices() : Promise.resolve([])
}

defineExpose({
  connect,
  disconnect,
  feedData,
  isConnected,
  audioDevices,
  activeAudioDeviceId,
  getAudioDevices
})
</script>

<template>
  <div
    class="fft-visualizer"
    :style="{ background }"
  >
    <canvas
      ref="canvasRef"
      class="fft-canvas"
      role="img"
      :aria-label="isConnected ? `Audio spectrum visualization, ${displayBins} bands` : 'Audio spectrum visualizer (inactive)'"
    />
    <div v-if="showStats" class="fft-stats">
      <slot name="stats" :connected="isConnected" :bands="displayBins" :fps="fps">
        <span v-if="isConnected" class="connected">{{ displayBins }} bands @ {{ fps }}fps</span>
        <span v-else class="disconnected">Disconnected</span>
      </slot>
    </div>
  </div>
</template>

<style scoped>
.fft-visualizer {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 100px;
  /* Background is set inline from the `background` prop (default #0a0a0a) */
  border-radius: 8px;
  overflow: hidden;
}

.fft-canvas {
  width: 100%;
  height: 100%;
  display: block;
}

.fft-stats {
  position: absolute;
  top: 8px;
  right: 8px;
  font-size: 12px;
  font-family: monospace;
  padding: 4px 8px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.6);
}

.connected {
  color: #00ff88;
}

.disconnected {
  color: #ff4444;
}
</style>
