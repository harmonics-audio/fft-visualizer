import { resolveGradientStops, buildGradientLUT, GRADIENT_LUT_SIZE, type GradientInput } from './gradients'
import {
  aggregateBins,
  aggregatePeaks,
  peakToUint8,
  applyNoiseFloor,
  applySmoothing,
  updatePeaks
} from './processing'
import { createLocalAudio, type LocalAudioEngine, type AudioDevice } from './localAudio'

/**
 * FFTVisualizer — high-performance, framework-agnostic WebGL spectrum analyzer.
 *
 * Supports three data-source modes:
 * - 'websocket': receives pre-computed FFT data via WebSocket (default)
 * - 'local': captures audio from mic/system and computes FFT in-browser via Rust WASM
 * - 'external': receives externally provided FFT data via `setOptions`/`feedData`
 *
 * WebSocket protocol (mode='websocket'):
 * 1. Connect to websocketUrl
 * 2. Server sends config: {"type":"config","mode":"fft","bins":80,"fps":120}
 * 3. Server streams binary: N bytes of uint8 (frequency magnitudes 0-255)
 */

export type VisualizerMode = 'websocket' | 'local' | 'external'
export type BandCount = 10 | 20 | 40 | 80

export interface FFTVisualizerOptions {
  /** Data source mode (default: 'websocket') */
  mode?: VisualizerMode
  /** WebSocket URL (required when mode='websocket') */
  websocketUrl?: string
  /** External FFT data (mono or combined) — Uint8Array of frequency magnitudes (0-255) */
  data?: Uint8Array
  /** External FFT data for left channel (stereo mode) */
  dataLeft?: Uint8Array
  /** External FFT data for right channel (stereo mode) */
  dataRight?: Uint8Array
  /** Audio source type for local mode */
  audioSource?: 'mic' | 'display'
  /** Audio input device ID for local mode */
  audioDeviceId?: string
  /** Show peak indicators above bars (default: true) */
  showPeaks?: boolean
  /** Peak decay rate (0.99 = slow decay, 0.9 = fast decay; default: 0.997) */
  peakDecay?: number
  /** Number of frequency bands to display (default: 80) */
  bands?: BandCount
  /** Enable LED segment effect (default: false) */
  ledBars?: boolean
  /** LED look: 'segment' = fixed-pixel horizontal segments; 'meter' = short, wide segments sized from bar width (default: 'segment') */
  ledShape?: 'segment' | 'meter'
  /** Full-height bars whose brightness follows the level (default: false) */
  lumiBars?: boolean
  /** Render the spectrum as a circle (default: false) */
  radial?: boolean
  /** Radial mode: inner hole radius as a fraction of the outer radius (0-0.9; default: 0.35) */
  radialInnerRadius?: number
  /** Gap between bars as a fraction of bar width (0 = none, max 0.9; default: 0.25) */
  barSpace?: number
  /** Mirrored reflection (0 = off; default: 0) */
  reflexRatio?: number
  /** Brightness of the reflection (0-1; default: 0.25) */
  reflexAlpha?: number
  /** Glow above the bar tops (0 = off, 1 = max; default: 0) */
  glow?: number
  /** Rotate the whole visual clockwise, in degrees (default: 0) */
  rotation?: 0 | 90 | 180 | 270
  /** Bar color gradient: preset name (see gradientPresets) or custom stops (default: 'classic') */
  gradient?: GradientInput
  /** Gradient direction (default: 'vertical') */
  gradientDirection?: 'vertical' | 'horizontal'
  /** 'gradient' paints along the gradient axis; 'bar-level' colors each whole bar by its current level (default: 'gradient') */
  colorMode?: 'gradient' | 'bar-level'
  /** Noise floor threshold (0-255; default: 0) */
  noiseFloor?: number
  /** Temporal smoothing factor (0 = none, 0.9 = heavy; default: 0) */
  smoothing?: number
  /** Enable stereo mode (left channel top, right channel bottom; default: false) */
  stereo?: boolean
  /** Background color behind and between the bars — any solid CSS color (default: '#0a0a0a') */
  background?: string
  /** Auto-reconnect the WebSocket with exponential backoff after an unexpected drop (default: false) */
  autoReconnect?: boolean
  /** Log connection/config diagnostics to the console (default: false) */
  debug?: boolean
}

/**
 * Payload of the `frame` event. Fired once per processed audio frame with the
 * display bar magnitudes (0-255), one entry per bar. In mono modes `left`/`right`
 * are null; in stereo `data` is the per-bar max of both channels.
 */
export interface FrameEvent {
  data: Uint8Array
  left: Uint8Array | null
  right: Uint8Array | null
}

export interface FFTVisualizerEventMap {
  connected: void
  disconnected: void
  error: string
  frame: FrameEvent
  /** Local-audio state changed: capture started/stopped or the device list updated. */
  audiostate: void
}

type Handler<T> = (payload: T) => void

const DEFAULTS: Required<Omit<FFTVisualizerOptions,
  'websocketUrl' | 'data' | 'dataLeft' | 'dataRight' | 'audioSource' | 'audioDeviceId'>> = {
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
  autoReconnect: false,
  debug: false
}

const vertexShaderSource = `
  attribute vec2 a_position;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`

const fragmentShaderSource = `
  precision mediump float;

  uniform vec2 u_resolution;
  uniform float u_dpr; // device pixel ratio, for pixel-exact LED gaps
  uniform vec3 u_bgColor; // background / empty-area color
  uniform float u_bgAlpha; // 1 = opaque background; < 1 enables a transparent canvas
  uniform float u_bins;
  uniform bool u_showPeaks;
  uniform bool u_ledBars;
  uniform bool u_ledMeter;
  uniform bool u_lumiBars;
  uniform bool u_gradientHorizontal;
  uniform bool u_barLevelColor;
  uniform bool u_stereo;
  uniform bool u_radial;
  uniform float u_radialInner;
  uniform float u_barSpace;
  uniform float u_reflexRatio;
  uniform float u_reflexAlpha;
  uniform float u_glow;
  uniform float u_rotation; // clockwise quarter turns (0-3)
  uniform sampler2D u_fftData;
  uniform sampler2D u_peakData;
  uniform sampler2D u_fftDataRight;
  uniform sampler2D u_peakDataRight;
  uniform sampler2D u_gradientTex;

  vec3 getGradientColor(float t) {
    return texture2D(u_gradientTex, vec2(clamp(t, 0.0, 1.0), 0.5)).rgb;
  }

  // Render one channel in "column space": x = band axis (0-1), y = level axis (0-1).
  // levelPx is y expressed in device pixels along the level axis (measured from
  // the bar base); barWidthPx is one bar's pitch in device pixels (0 when the
  // metric doesn't apply, e.g. radial). Both drive the LED gap placement.
  // Works for linear bars and (via polar transform) radial.
  vec4 renderBars(float x, float y, float levelPx, float barWidthPx, sampler2D fftTex, sampler2D peakTex, float peakHalf) {
    vec4 bgColor = vec4(u_bgColor, u_bgAlpha);

    float barLocalX = fract(x * u_bins);
    if (barLocalX > (1.0 - u_barSpace)) {
      return bgColor;
    }

    float texCoord = (floor(x * u_bins) + 0.5) / u_bins;
    float fftValue = texture2D(fftTex, vec2(texCoord, 0.5)).r;
    float peakValue = texture2D(peakTex, vec2(texCoord, 0.5)).r;

    // LED gaps.
    //  - 'segment': fixed 2px-wide black line every 20 CSS px, anchored to device
    //    pixels so gaps look identical at any canvas size or DPR.
    //  - 'meter': short, wide segments sized from bar width (pitch ~= half a bar
    //    width, so lit cells run ~2:1 wider than tall) with thin proportional
    //    gaps, like a classic LED meter. Scales with bar width, so it varies with
    //    bands/canvas size.
    float ledSpacing = 20.0 * u_dpr;
    float ledGapPx = 2.0 * u_dpr;
    if (u_ledMeter && barWidthPx > 0.0) {
      ledSpacing = barWidthPx * 0.5;
      ledGapPx = u_barSpace * ledSpacing;
    }
    bool inLedGap = u_ledBars && mod(levelPx, ledSpacing) < ledGapPx;

    if (u_lumiBars) {
      // Full-height bars whose brightness follows the level
      if (inLedGap) return bgColor;
      float gradientPos = u_barLevelColor ? fftValue : (u_gradientHorizontal ? x : y);
      vec3 color = getGradientColor(gradientPos);
      // Opaque bg: blend brightness into the bg color. Transparent: fade via alpha.
      if (u_bgAlpha >= 1.0) return vec4(mix(bgColor.rgb, color, fftValue), 1.0);
      return vec4(color, fftValue);
    }

    if (y <= fftValue) {
      if (inLedGap) return bgColor;
      float gradientPos = u_barLevelColor ? fftValue : (u_gradientHorizontal ? x : y);
      return vec4(getGradientColor(gradientPos), 1.0);
    } else if (u_showPeaks && y >= peakValue - peakHalf && y <= peakValue + peakHalf) {
      float peakGradientPos = (u_barLevelColor || !u_gradientHorizontal) ? peakValue : x;
      return vec4(getGradientColor(peakGradientPos), 0.5);
    }

    if (u_glow > 0.0) {
      // Soft light rising from the bar top, in the bar-top's color. Faded out
      // for near-silent bars so idle columns stay dark.
      float g = u_glow * exp((fftValue - y) * 10.0) * smoothstep(0.0, 0.05, fftValue);
      vec3 glowColor = getGradientColor((u_barLevelColor || !u_gradientHorizontal) ? fftValue : x);
      // Opaque bg: blend glow into the bg color. Transparent: glow rides on alpha.
      if (u_bgAlpha >= 1.0) return vec4(mix(bgColor.rgb, glowColor, clamp(g, 0.0, 1.0)), 1.0);
      return vec4(glowColor, clamp(g, 0.0, 1.0));
    }
    return bgColor;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    vec4 bgColor = vec4(u_bgColor, u_bgAlpha);

    if (u_radial) {
      // Polar transform: angle -> band axis, radius -> level axis
      vec2 p = uv - 0.5;
      p.x *= u_resolution.x / u_resolution.y;
      float outerR = 0.5;
      float innerR = u_radialInner * outerR;
      float r = length(p);
      if (r > outerR) {
        gl_FragColor = bgColor;
        return;
      }

      float level;
      float levelPx;
      float radialDim = 1.0;
      if (r >= innerR) {
        level = (r - innerR) / (outerR - innerR);
        levelPx = (r - innerR) * u_resolution.y;
      } else if (u_reflexRatio > 0.0) {
        // Reflection inside the inner circle: bars mirror inward at half height
        level = (innerR - r) / (outerR - innerR) * 2.0;
        levelPx = (innerR - r) * u_resolution.y;
        radialDim = u_reflexAlpha;
      } else {
        gl_FragColor = bgColor;
        return;
      }

      float angle = atan(p.x, p.y); // 0 at 12 o'clock, +/-pi at 6 o'clock
      // Rotation: offset the angle (rotating uv would break the aspect fix)
      angle = mod(angle - u_rotation * 1.5707963 + 3.14159265, 6.28318531) - 3.14159265;
      vec4 c;
      if (u_stereo) {
        // Left channel sweeps the right half, right channel mirrors on the left
        float x = abs(angle) / 3.14159265;
        if (angle >= 0.0) {
          c = renderBars(x, level, levelPx, 0.0, u_fftData, u_peakData, 0.006);
        } else {
          c = renderBars(x, level, levelPx, 0.0, u_fftDataRight, u_peakDataRight, 0.006);
        }
      } else {
        float x = angle / 6.28318531 + 0.5;
        c = renderBars(x, level, levelPx, 0.0, u_fftData, u_peakData, 0.006);
      }
      // Opaque bg: dim the reflection toward the bg color. Transparent: dim via alpha.
      if (u_bgAlpha >= 1.0) {
        gl_FragColor = vec4(mix(bgColor.rgb, c.rgb, radialDim), c.a);
      } else {
        gl_FragColor = vec4(c.rgb, c.a * radialDim);
      }
      return;
    }

    // Rotation (clockwise): sample the un-rotated content for this pixel.
    // Content is stretched to the canvas, so 90/270 also swap the axes' span.
    bool axisSwap = false;
    if (u_rotation > 2.5) {
      uv = vec2(uv.y, 1.0 - uv.x);
      axisSwap = true;
    } else if (u_rotation > 1.5) {
      uv = vec2(1.0 - uv.x, 1.0 - uv.y);
    } else if (u_rotation > 0.5) {
      uv = vec2(1.0 - uv.y, uv.x);
      axisSwap = true;
    }
    // Pixel extents of the axes; 90/270 rotations swap width and height.
    float levelRes = axisSwap ? u_resolution.x : u_resolution.y;
    float bandRes = axisSwap ? u_resolution.y : u_resolution.x;
    float barWidthPx = bandRes / u_bins;

    if (u_stereo) {
      // Thin black divider line between left and right channels
      float dividerHalf = 1.0 / u_resolution.y;
      if (abs(uv.y - 0.5) < dividerHalf) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
      }
      // Left channel grows up from center, right channel grows down from center
      if (uv.y >= 0.5) {
        gl_FragColor = renderBars(uv.x, (uv.y - 0.5) * 2.0, (uv.y - 0.5) * levelRes, barWidthPx, u_fftData, u_peakData, 0.006);
      } else {
        gl_FragColor = renderBars(uv.x, (0.5 - uv.y) * 2.0, (0.5 - uv.y) * levelRes, barWidthPx, u_fftDataRight, u_peakDataRight, 0.006);
      }
      return;
    }

    // Mono, with optional mirrored reflection in the bottom u_reflexRatio of the canvas
    float y = uv.y;
    float levelPx = uv.y * levelRes;
    float dim = 1.0;
    if (u_reflexRatio > 0.0) {
      if (uv.y < u_reflexRatio) {
        // Reflection is squashed to half the main bar height
        y = (u_reflexRatio - uv.y) / (1.0 - u_reflexRatio) * 2.0;
        levelPx = (u_reflexRatio - uv.y) * levelRes;
        dim = u_reflexAlpha;
      } else {
        y = (uv.y - u_reflexRatio) / (1.0 - u_reflexRatio);
        levelPx = (uv.y - u_reflexRatio) * levelRes;
      }
    }
    vec4 c = renderBars(uv.x, y, levelPx, barWidthPx, u_fftData, u_peakData, 0.003);
    // Opaque bg: dim the reflection toward the bg color. Transparent: dim via alpha.
    if (u_bgAlpha >= 1.0) {
      gl_FragColor = vec4(mix(bgColor.rgb, c.rgb, dim), c.a);
    } else {
      gl_FragColor = vec4(c.rgb, c.a * dim);
    }
  }
`

export class FFTVisualizer {
  private canvas: HTMLCanvasElement
  private options: FFTVisualizerOptions & typeof DEFAULTS

  // Background color for the shader, parsed from the `background` option via a
  // canvas so any CSS color (incl. rgba()/'transparent') works.
  private bgColorRgb: [number, number, number] = [0.04, 0.04, 0.04]
  private bgAlpha = 1

  private _isConnected = false
  private _fps = 0

  // FFT data (server sends N bins, we aggregate for display)
  private serverBins = 80

  // Mono smoothing/peak state
  private smoothedFftData: Float32Array = new Float32Array(80)
  private peakData: Float32Array = new Float32Array(80)

  // Stereo smoothing/peak state (left/right channels)
  private smoothedFftDataLeft: Float32Array = new Float32Array(80)
  private peakDataLeft: Float32Array = new Float32Array(80)
  private smoothedFftDataRight: Float32Array = new Float32Array(80)
  private peakDataRight: Float32Array = new Float32Array(80)

  // Display data (aggregated to options.bands)
  private displayFftData: Uint8Array
  private displayPeakData: Float32Array
  private displayFftDataLeft: Uint8Array
  private displayPeakDataLeft: Float32Array
  private displayFftDataRight: Uint8Array
  private displayPeakDataRight: Float32Array

  // Local audio (WASM FFT)
  private localAudio: LocalAudioEngine

  // WebSocket
  private websocket: WebSocket | null = null
  private animationId: number | null = null
  private frameCount = 0
  private lastFpsTime = 0

  // Auto-reconnect (exponential backoff, opt-in via the autoReconnect option)
  private reconnectAttempts = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private readonly RECONNECT_BASE_MS = 1000
  private readonly RECONNECT_MAX_MS = 30000

  // Resize observation
  private resizeObserver: ResizeObserver | null = null
  private usingWindowResize = false

  // True when the canvas uses an alpha context (transparent background)
  private transparentMode = false

  // WebGL state
  private gl: WebGLRenderingContext | null = null
  private program: WebGLProgram | null = null
  private positionBuffer: WebGLBuffer | null = null
  private fftTexture: WebGLTexture | null = null
  private peakTexture: WebGLTexture | null = null
  private fftTextureRight: WebGLTexture | null = null
  private peakTextureRight: WebGLTexture | null = null
  private gradientTexture: WebGLTexture | null = null

  // Shader locations
  private uResolutionLoc: WebGLUniformLocation | null = null
  private uDprLoc: WebGLUniformLocation | null = null
  private uBgColorLoc: WebGLUniformLocation | null = null
  private uBgAlphaLoc: WebGLUniformLocation | null = null
  private uBinsLoc: WebGLUniformLocation | null = null
  private uShowPeaksLoc: WebGLUniformLocation | null = null
  private uLedBarsLoc: WebGLUniformLocation | null = null
  private uLedMeterLoc: WebGLUniformLocation | null = null
  private uLumiBarsLoc: WebGLUniformLocation | null = null
  private uRadialLoc: WebGLUniformLocation | null = null
  private uRadialInnerLoc: WebGLUniformLocation | null = null
  private uBarSpaceLoc: WebGLUniformLocation | null = null
  private uReflexRatioLoc: WebGLUniformLocation | null = null
  private uReflexAlphaLoc: WebGLUniformLocation | null = null
  private uGlowLoc: WebGLUniformLocation | null = null
  private uRotationLoc: WebGLUniformLocation | null = null
  private uGradientTexLoc: WebGLUniformLocation | null = null
  private uGradientHorizontalLoc: WebGLUniformLocation | null = null
  private uBarLevelColorLoc: WebGLUniformLocation | null = null
  private uStereoLoc: WebGLUniformLocation | null = null
  private uFftDataLoc: WebGLUniformLocation | null = null
  private uPeakDataLoc: WebGLUniformLocation | null = null
  private uFftDataRightLoc: WebGLUniformLocation | null = null
  private uPeakDataRightLoc: WebGLUniformLocation | null = null

  // Event listeners
  private listeners: { [K in keyof FFTVisualizerEventMap]: Set<Handler<FFTVisualizerEventMap[K]>> } = {
    connected: new Set(),
    disconnected: new Set(),
    error: new Set(),
    frame: new Set(),
    audiostate: new Set()
  }

  constructor(canvas: HTMLCanvasElement, options?: FFTVisualizerOptions) {
    this.canvas = canvas
    this.options = { ...DEFAULTS, ...options }

    const bands = this.options.bands
    this.displayFftData = new Uint8Array(bands)
    this.displayPeakData = new Float32Array(bands)
    this.displayFftDataLeft = new Uint8Array(bands)
    this.displayPeakDataLeft = new Float32Array(bands)
    this.displayFftDataRight = new Uint8Array(bands)
    this.displayPeakDataRight = new Float32Array(bands)

    // Local audio engine — computes FFT client-side and drives the mono pipeline.
    this.localAudio = createLocalAudio({
      bins: bands,
      onData: (data) => {
        if (this.options.mode !== 'local' || !this.localAudio.isActive) return
        if (data.length !== this.serverBins) this.initBuffers(data.length)
        this.processMonoData(new Uint8Array(data))
      },
      onStateChange: () => {
        // Detect when display sharing is stopped via the browser UI
        if (!this.localAudio.isActive && this._isConnected && this.options.mode === 'local') {
          this.stopRendering()
          this._isConnected = false
          this.emit('disconnected', undefined)
        }
        this.emit('audiostate', undefined)
      }
    })

    // Seed the background color (opaque vs transparent is fixed here — the
    // context's alpha flag can't change after initWebGL).
    this.applyBackground(this.options.background)

    this.handleResize()

    if (!this.initWebGL()) {
      this.debugLog('Failed to initialize WebGL')
      this.emit('error', 'WebGL initialization failed')
      return
    }

    // Observe the canvas's container so it rescales on any layout change
    // (flex/grid resize, sidebar toggle, …), not just window resizes.
    const container = this.canvas.parentElement
    if (container && typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(this.handleResize)
      this.resizeObserver.observe(container)
    } else if (typeof window !== 'undefined') {
      this.usingWindowResize = true
      window.addEventListener('resize', this.handleResize)
    }

    this.connect()
  }

  // ---- Public API ----------------------------------------------------------

  get isConnected(): boolean {
    return this._isConnected
  }

  get fps(): number {
    return this._fps
  }

  get audioDevices(): AudioDevice[] {
    return this.localAudio.devices
  }

  get activeAudioDeviceId(): string | undefined {
    return this.localAudio.activeDeviceId
  }

  getAudioDevices(): Promise<AudioDevice[]> {
    return this.localAudio.getDevices()
  }

  /** Subscribe to an event; returns an unsubscribe function. */
  on<K extends keyof FFTVisualizerEventMap>(event: K, handler: Handler<FFTVisualizerEventMap[K]>): () => void {
    this.listeners[event].add(handler)
    return () => this.off(event, handler)
  }

  /** Unsubscribe a previously registered handler. */
  off<K extends keyof FFTVisualizerEventMap>(event: K, handler: Handler<FFTVisualizerEventMap[K]>): void {
    this.listeners[event].delete(handler)
  }

  /**
   * Apply a partial options update. Only keys whose value actually changed take
   * effect; pass `gradient` by a new reference to reload it, or call
   * `refreshGradient()` after mutating the current stops in place.
   */
  setOptions(patch: Partial<FFTVisualizerOptions>): void {
    const prev = this.options
    this.options = { ...prev, ...patch }

    if (patch.background !== undefined && patch.background !== prev.background) {
      this.applyBackground(this.options.background)
    }
    if (patch.gradient !== undefined && patch.gradient !== prev.gradient) {
      this.uploadGradientTexture()
    }
    if (patch.bands !== undefined && patch.bands !== prev.bands) {
      this.reallocDisplay(patch.bands)
    }
    if (patch.mode !== undefined && patch.mode !== prev.mode) {
      this.disconnect()
      this.connect()
      return
    }
    if (patch.websocketUrl !== undefined && patch.websocketUrl !== prev.websocketUrl
      && this.options.mode === 'websocket') {
      this.disconnect()
      this.connect()
    }
    if (this.options.mode === 'external') {
      if (patch.data !== undefined && patch.data !== prev.data && patch.data) {
        this.feedExternal(patch.data)
      }
      if ((patch.dataLeft !== undefined && patch.dataLeft !== prev.dataLeft && patch.dataLeft)
        || (patch.dataRight !== undefined && patch.dataRight !== prev.dataRight && patch.dataRight)) {
        if (patch.dataLeft) this.feedExternalLeft(patch.dataLeft)
        if (patch.dataRight) this.feedExternalRight(patch.dataRight)
      }
    }
  }

  /** Rebuild the gradient LUT from the current `gradient` option (use after mutating custom stops in place). */
  refreshGradient(): void {
    this.uploadGradientTexture()
  }

  /**
   * Imperatively feed FFT frames (0-255 magnitudes). Preferred when you mutate
   * one buffer in place each frame. Pass `left` and `right` for stereo. Data is
   * copied, so the caller may reuse its buffers.
   */
  feedData(data: Uint8Array, left?: Uint8Array, right?: Uint8Array): void {
    if (left && right) {
      if (left.length !== this.serverBins) this.initBuffers(left.length)
      this.processLeftData(new Uint8Array(left))
      this.processRightData(new Uint8Array(right))
    } else {
      if (data.length !== this.serverBins) this.initBuffers(data.length)
      this.processMonoData(new Uint8Array(data))
    }
  }

  connect(): void {
    if (this.options.mode === 'local') {
      this.startLocalAudio()
    } else if (this.options.mode === 'external') {
      this._isConnected = true
      this.emit('connected', undefined)
      this.startRendering()
    } else {
      this.connectWebSocket()
    }
  }

  disconnect(): void {
    if (this.options.mode === 'local') {
      this.stopLocalAudio()
    } else if (this.options.mode === 'external') {
      this.stopRendering()
      this._isConnected = false
      this.emit('disconnected', undefined)
    } else {
      this.disconnectWebSocket()
    }
  }

  /** Tear down: disconnect, stop observing, and free all WebGL resources. */
  destroy(): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect()
      this.resizeObserver = null
    } else if (this.usingWindowResize && typeof window !== 'undefined') {
      window.removeEventListener('resize', this.handleResize)
    }
    this.disconnect()

    const gl = this.gl
    if (gl) {
      if (this.fftTexture) gl.deleteTexture(this.fftTexture)
      if (this.peakTexture) gl.deleteTexture(this.peakTexture)
      if (this.fftTextureRight) gl.deleteTexture(this.fftTextureRight)
      if (this.peakTextureRight) gl.deleteTexture(this.peakTextureRight)
      if (this.gradientTexture) gl.deleteTexture(this.gradientTexture)
      if (this.positionBuffer) gl.deleteBuffer(this.positionBuffer)
      if (this.program) gl.deleteProgram(this.program)
    }

    for (const set of Object.values(this.listeners)) set.clear()
  }

  // ---- Internals -----------------------------------------------------------

  private emit<K extends keyof FFTVisualizerEventMap>(event: K, payload: FFTVisualizerEventMap[K]): void {
    for (const handler of this.listeners[event]) handler(payload)
  }

  private debugLog(...args: unknown[]) {
    if (this.options.debug) console.log('[FFTVisualizer]', ...args)
  }

  // The frame event fires every audio frame, so skip its work entirely unless a
  // listener is attached (keeps the render path allocation-free otherwise).
  private emitFrame() {
    if (this.listeners.frame.size === 0) return
    if (this.options.stereo) {
      const l = this.displayFftDataLeft
      const r = this.displayFftDataRight
      const mono = new Uint8Array(l.length)
      for (let i = 0; i < mono.length; i++) mono[i] = l[i]! > r[i]! ? l[i]! : r[i]!
      this.emit('frame', { data: mono, left: l, right: r })
    } else {
      this.emit('frame', { data: this.displayFftData, left: null, right: null })
    }
  }

  private applyBackground(color: string) {
    const [r, g, b, a] = parseCssColor(color)
    this.bgColorRgb = [r, g, b]
    this.bgAlpha = a
  }

  private reallocDisplay(bands: number) {
    this.displayFftData = new Uint8Array(bands)
    this.displayPeakData = new Float32Array(bands)
    this.displayFftDataLeft = new Uint8Array(bands)
    this.displayPeakDataLeft = new Float32Array(bands)
    this.displayFftDataRight = new Uint8Array(bands)
    this.displayPeakDataRight = new Float32Array(bands)
  }

  private feedExternal(data: Uint8Array) {
    if (data.length !== this.serverBins) this.initBuffers(data.length)
    this.processMonoData(new Uint8Array(data))
  }

  private feedExternalLeft(data: Uint8Array) {
    if (data.length !== this.serverBins) this.initBuffers(data.length)
    this.processLeftData(new Uint8Array(data))
  }

  private feedExternalRight(data: Uint8Array) {
    if (data.length !== this.serverBins) this.initBuffers(data.length)
    this.processRightData(new Uint8Array(data))
  }

  private createShader(glCtx: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
    const shader = glCtx.createShader(type)
    if (!shader) return null

    glCtx.shaderSource(shader, source)
    glCtx.compileShader(shader)

    if (!glCtx.getShaderParameter(shader, glCtx.COMPILE_STATUS)) {
      console.error('Shader compile error:', glCtx.getShaderInfoLog(shader))
      glCtx.deleteShader(shader)
      return null
    }

    return shader
  }

  private createTexture(glCtx: WebGLRenderingContext, nearest = false): WebGLTexture | null {
    const texture = glCtx.createTexture()
    if (!texture) return null
    const filter = nearest ? glCtx.NEAREST : glCtx.LINEAR
    glCtx.bindTexture(glCtx.TEXTURE_2D, texture)
    glCtx.texParameteri(glCtx.TEXTURE_2D, glCtx.TEXTURE_MIN_FILTER, filter)
    glCtx.texParameteri(glCtx.TEXTURE_2D, glCtx.TEXTURE_MAG_FILTER, filter)
    glCtx.texParameteri(glCtx.TEXTURE_2D, glCtx.TEXTURE_WRAP_S, glCtx.CLAMP_TO_EDGE)
    glCtx.texParameteri(glCtx.TEXTURE_2D, glCtx.TEXTURE_WRAP_T, glCtx.CLAMP_TO_EDGE)
    return texture
  }

  private initWebGL(): boolean {
    const canvas = this.canvas

    // Transparent background needs an alpha context + straight-alpha blending.
    // Opaque (the default) keeps alpha:false so behavior is unchanged.
    this.transparentMode = this.bgAlpha < 1
    const gl = canvas.getContext('webgl', {
      antialias: false,
      alpha: this.transparentMode,
      premultipliedAlpha: false,
      // Keep the rendered frame readable so consumers can screenshot the canvas
      // (canvas.toDataURL) and pixel tests are deterministic. Fully redrawn every
      // frame, so there is no visual difference.
      preserveDrawingBuffer: true
    })

    if (!gl) {
      console.error('WebGL not supported')
      return false
    }
    this.gl = gl

    if (this.transparentMode) {
      gl.enable(gl.BLEND)
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
    }

    // Create shaders
    const vertexShader = this.createShader(gl, gl.VERTEX_SHADER, vertexShaderSource)
    const fragmentShader = this.createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource)

    if (!vertexShader || !fragmentShader) return false

    // Create program
    const program = gl.createProgram()
    if (!program) return false
    this.program = program

    gl.attachShader(program, vertexShader)
    gl.attachShader(program, fragmentShader)
    gl.linkProgram(program)

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Program link error:', gl.getProgramInfoLog(program))
      return false
    }

    gl.useProgram(program)

    // Create full-screen quad
    this.positionBuffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
      -1,  1,
       1, -1,
       1,  1
    ]), gl.STATIC_DRAW)

    const positionLoc = gl.getAttribLocation(program, 'a_position')
    gl.enableVertexAttribArray(positionLoc)
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0)

    // Get uniform locations
    this.uResolutionLoc = gl.getUniformLocation(program, 'u_resolution')
    this.uDprLoc = gl.getUniformLocation(program, 'u_dpr')
    this.uBgColorLoc = gl.getUniformLocation(program, 'u_bgColor')
    this.uBgAlphaLoc = gl.getUniformLocation(program, 'u_bgAlpha')
    this.uBinsLoc = gl.getUniformLocation(program, 'u_bins')
    this.uShowPeaksLoc = gl.getUniformLocation(program, 'u_showPeaks')
    this.uLedBarsLoc = gl.getUniformLocation(program, 'u_ledBars')
    this.uLedMeterLoc = gl.getUniformLocation(program, 'u_ledMeter')
    this.uLumiBarsLoc = gl.getUniformLocation(program, 'u_lumiBars')
    this.uRadialLoc = gl.getUniformLocation(program, 'u_radial')
    this.uRadialInnerLoc = gl.getUniformLocation(program, 'u_radialInner')
    this.uBarSpaceLoc = gl.getUniformLocation(program, 'u_barSpace')
    this.uReflexRatioLoc = gl.getUniformLocation(program, 'u_reflexRatio')
    this.uReflexAlphaLoc = gl.getUniformLocation(program, 'u_reflexAlpha')
    this.uGlowLoc = gl.getUniformLocation(program, 'u_glow')
    this.uRotationLoc = gl.getUniformLocation(program, 'u_rotation')
    this.uGradientTexLoc = gl.getUniformLocation(program, 'u_gradientTex')
    this.uGradientHorizontalLoc = gl.getUniformLocation(program, 'u_gradientHorizontal')
    this.uBarLevelColorLoc = gl.getUniformLocation(program, 'u_barLevelColor')
    this.uStereoLoc = gl.getUniformLocation(program, 'u_stereo')
    this.uFftDataLoc = gl.getUniformLocation(program, 'u_fftData')
    this.uPeakDataLoc = gl.getUniformLocation(program, 'u_peakData')
    this.uFftDataRightLoc = gl.getUniformLocation(program, 'u_fftDataRight')
    this.uPeakDataRightLoc = gl.getUniformLocation(program, 'u_peakDataRight')

    // Create textures (left/mono = 0,1 — right = 2,3)
    gl.activeTexture(gl.TEXTURE0)
    this.fftTexture = this.createTexture(gl)
    gl.activeTexture(gl.TEXTURE1)
    this.peakTexture = this.createTexture(gl, true)
    gl.activeTexture(gl.TEXTURE2)
    this.fftTextureRight = this.createTexture(gl)
    gl.activeTexture(gl.TEXTURE3)
    this.peakTextureRight = this.createTexture(gl, true)
    gl.activeTexture(gl.TEXTURE4)
    this.gradientTexture = this.createTexture(gl)

    // Set texture units
    gl.uniform1i(this.uFftDataLoc, 0)
    gl.uniform1i(this.uPeakDataLoc, 1)
    gl.uniform1i(this.uFftDataRightLoc, 2)
    gl.uniform1i(this.uPeakDataRightLoc, 3)
    gl.uniform1i(this.uGradientTexLoc, 4)

    this.uploadGradientTexture()

    return true
  }

  // Rasterize the current gradient (preset or custom stops) into the LUT texture
  private uploadGradientTexture() {
    const gl = this.gl
    if (!gl || !this.gradientTexture) return
    const lut = buildGradientLUT(resolveGradientStops(this.options.gradient))
    gl.activeTexture(gl.TEXTURE4)
    gl.bindTexture(gl.TEXTURE_2D, this.gradientTexture)
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.RGBA,
      GRADIENT_LUT_SIZE, 1, 0,
      gl.RGBA, gl.UNSIGNED_BYTE,
      lut
    )
  }

  // Process raw FFT data: apply noise floor, smoothing, peaks, and aggregate
  private processFFTData(
    newData: Uint8Array,
    smoothed: Float32Array,
    peak: Float32Array,
    setDisplayFft: (v: Uint8Array) => void,
    setDisplayPeak: (v: Float32Array) => void
  ) {
    applyNoiseFloor(newData, this.options.noiseFloor)
    applySmoothing(newData, smoothed, this.options.smoothing)
    updatePeaks(peak, newData, this.options.peakDecay)

    // Aggregate to display bands
    setDisplayFft(aggregateBins(newData, this.options.bands))
    setDisplayPeak(aggregatePeaks(peak, this.options.bands))
  }

  private processMonoData(newData: Uint8Array) {
    this.processFFTData(
      newData, this.smoothedFftData, this.peakData,
      v => { this.displayFftData = v },
      v => { this.displayPeakData = v }
    )
    // When stereo is enabled but only mono data is available, mirror to both channels
    if (this.options.stereo) {
      this.displayFftDataLeft = this.displayFftData
      this.displayPeakDataLeft = this.displayPeakData
      this.displayFftDataRight = this.displayFftData
      this.displayPeakDataRight = this.displayPeakData
    }
    this.frameCount++
    this.emitFrame()
  }

  private processLeftData(newData: Uint8Array) {
    this.processFFTData(
      newData, this.smoothedFftDataLeft, this.peakDataLeft,
      v => { this.displayFftDataLeft = v },
      v => { this.displayPeakDataLeft = v }
    )
  }

  private processRightData(newData: Uint8Array) {
    this.processFFTData(
      newData, this.smoothedFftDataRight, this.peakDataRight,
      v => { this.displayFftDataRight = v },
      v => { this.displayPeakDataRight = v }
    )
    this.frameCount++
    this.emitFrame()
  }

  private initBuffers(size: number) {
    this.serverBins = size
    this.smoothedFftData = new Float32Array(size)
    this.peakData = new Float32Array(size)
    this.smoothedFftDataLeft = new Float32Array(size)
    this.peakDataLeft = new Float32Array(size)
    this.smoothedFftDataRight = new Float32Array(size)
    this.peakDataRight = new Float32Array(size)
    const bands = this.options.bands
    this.displayFftData = new Uint8Array(bands)
    this.displayPeakData = new Float32Array(bands)
    this.displayFftDataLeft = new Uint8Array(bands)
    this.displayPeakDataLeft = new Float32Array(bands)
    this.displayFftDataRight = new Uint8Array(bands)
    this.displayPeakDataRight = new Float32Array(bands)
  }

  private scheduleReconnect() {
    if (!this.options.autoReconnect || this.options.mode !== 'websocket') return
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)

    const delay = Math.min(this.RECONNECT_MAX_MS, this.RECONNECT_BASE_MS * 2 ** this.reconnectAttempts)
    this.reconnectAttempts++
    this.debugLog(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      if (this.options.mode === 'websocket') this.connectWebSocket()
    }, delay)
  }

  private connectWebSocket() {
    if (this.websocket || !this.options.websocketUrl) return

    this.debugLog('Connecting to:', this.options.websocketUrl)
    const websocket = new WebSocket(this.options.websocketUrl)
    this.websocket = websocket
    websocket.binaryType = 'arraybuffer'

    websocket.onopen = () => {
      this.debugLog('Connected')
      this.reconnectAttempts = 0
      this._isConnected = true
      this.emit('connected', undefined)
      this.startRendering()
    }

    websocket.onmessage = (event) => {
      const data = event.data

      // Handle config message
      if (typeof data === 'string') {
        try {
          const config = JSON.parse(data)
          if (config.type === 'config' && config.mode === 'fft') {
            this.initBuffers(config.bins || 80)
            this.debugLog(`Config: ${config.bins} server bins, displaying ${this.options.bands} bands @ ${config.fps}fps`)
          }
        } catch (e) {
          this.debugLog('Failed to parse config:', e)
        }
        return
      }

      // Handle binary FFT data
      if (data instanceof ArrayBuffer) {
        const newData = new Uint8Array(data)
        if (newData.length === this.serverBins) {
          this.processMonoData(newData)
        }
      }
    }

    websocket.onerror = (event) => {
      this.debugLog('WebSocket error:', event)
      this.emit('error', 'WebSocket connection error')
    }

    websocket.onclose = () => {
      this.debugLog('Disconnected')
      this._isConnected = false
      this.websocket = null
      this.emit('disconnected', undefined)
      this.stopRendering()
      // Only fires for unexpected closes — manual disconnect nulls this handler first
      this.scheduleReconnect()
    }
  }

  private disconnectWebSocket() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.reconnectAttempts = 0
    if (this.websocket) {
      this.websocket.onopen = null
      this.websocket.onmessage = null
      this.websocket.onerror = null
      this.websocket.onclose = null
      this.websocket.close()
      this.websocket = null
    }
    this.stopRendering()
    this._isConnected = false
  }

  private async startLocalAudio() {
    try {
      if (this.options.audioSource === 'display') {
        await this.localAudio.startDisplay()
      } else {
        await this.localAudio.start(this.options.audioDeviceId)
      }
      this._isConnected = true
      this.emit('connected', undefined)
      this.startRendering()
    } catch (e) {
      this.debugLog('Local audio error:', e)
      this.emit('error', e instanceof Error ? e.message : 'Failed to start local audio')
    }
  }

  private stopLocalAudio() {
    // Set first so the engine's onStateChange (fired synchronously by stop())
    // sees us already disconnected and doesn't emit a duplicate event.
    this._isConnected = false
    this.localAudio.stop()
    this.stopRendering()
    this.emit('disconnected', undefined)
  }

  private startRendering() {
    if (this.animationId) return

    const render = () => {
      this.drawSpectrum()
      this.animationId = requestAnimationFrame(render)

      // Calculate FPS
      const now = performance.now()
      if (now - this.lastFpsTime >= 1000) {
        this._fps = this.frameCount
        this.frameCount = 0
        this.lastFpsTime = now
      }
    }

    this.lastFpsTime = performance.now()
    this.frameCount = 0
    render()
  }

  private stopRendering() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId)
      this.animationId = null
    }
  }

  private uploadTexture(unit: number, texture: WebGLTexture | null, data: Uint8Array, numBins: number) {
    const gl = this.gl
    if (!gl) return
    gl.activeTexture(gl.TEXTURE0 + unit)
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.LUMINANCE,
      numBins, 1, 0,
      gl.LUMINANCE, gl.UNSIGNED_BYTE,
      data
    )
  }

  private drawSpectrum() {
    const gl = this.gl
    if (!gl || !this.program) return

    const canvas = this.canvas
    const numBins = this.options.bands
    const isStereo = this.options.stereo

    if (isStereo) {
      // Upload left channel data
      this.uploadTexture(0, this.fftTexture, this.displayFftDataLeft, numBins)
      this.uploadTexture(1, this.peakTexture, peakToUint8(this.displayPeakDataLeft, numBins), numBins)
      // Upload right channel data
      this.uploadTexture(2, this.fftTextureRight, this.displayFftDataRight, numBins)
      this.uploadTexture(3, this.peakTextureRight, peakToUint8(this.displayPeakDataRight, numBins), numBins)
    } else {
      // Upload mono data
      this.uploadTexture(0, this.fftTexture, this.displayFftData, numBins)
      this.uploadTexture(1, this.peakTexture, peakToUint8(this.displayPeakData, numBins), numBins)
    }

    const o = this.options

    // Set uniforms
    gl.uniform2f(this.uResolutionLoc, canvas.width, canvas.height)
    gl.uniform1f(this.uDprLoc, (typeof window !== 'undefined' && window.devicePixelRatio) || 1)
    gl.uniform3f(this.uBgColorLoc, this.bgColorRgb[0], this.bgColorRgb[1], this.bgColorRgb[2])
    gl.uniform1f(this.uBgAlphaLoc, this.bgAlpha)
    gl.uniform1f(this.uBinsLoc, numBins)
    gl.uniform1i(this.uShowPeaksLoc, o.showPeaks ? 1 : 0)
    gl.uniform1i(this.uLedBarsLoc, o.ledBars ? 1 : 0)
    gl.uniform1i(this.uLedMeterLoc, o.ledShape === 'meter' ? 1 : 0)
    gl.uniform1i(this.uLumiBarsLoc, o.lumiBars ? 1 : 0)
    gl.uniform1i(this.uRadialLoc, o.radial ? 1 : 0)
    gl.uniform1f(this.uRadialInnerLoc, Math.min(0.9, Math.max(0, o.radialInnerRadius)))
    gl.uniform1f(this.uBarSpaceLoc, Math.min(0.9, Math.max(0, o.barSpace)))
    gl.uniform1f(this.uReflexRatioLoc, Math.min(0.7, Math.max(0, o.reflexRatio)))
    gl.uniform1f(this.uReflexAlphaLoc, Math.min(1, Math.max(0, o.reflexAlpha)))
    gl.uniform1f(this.uGlowLoc, Math.min(1, Math.max(0, o.glow)))
    gl.uniform1f(this.uRotationLoc, (Math.round(o.rotation / 90) % 4 + 4) % 4)
    gl.uniform1i(this.uGradientHorizontalLoc, o.gradientDirection === 'horizontal' ? 1 : 0)
    gl.uniform1i(this.uBarLevelColorLoc, o.colorMode === 'bar-level' ? 1 : 0)
    gl.uniform1i(this.uStereoLoc, isStereo ? 1 : 0)

    // Draw. In transparent mode, clear first so blended fragments don't accumulate
    // across frames (opaque mode's full-screen quad overwrites every pixel anyway).
    gl.viewport(0, 0, canvas.width, canvas.height)
    if (this.transparentMode) {
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
    }
    gl.drawArrays(gl.TRIANGLES, 0, 6)
  }

  private handleResize = () => {
    const canvas = this.canvas
    const container = canvas.parentElement
    const target = container ?? canvas
    const rect = target.getBoundingClientRect()
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1

    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    // Only pin the CSS size when a container drives layout; a standalone canvas
    // keeps whatever size CSS gives it (setting it here would fight the observer).
    if (container) {
      canvas.style.width = `${rect.width}px`
      canvas.style.height = `${rect.height}px`
    }

    if (this.gl) {
      this.gl.viewport(0, 0, canvas.width, canvas.height)
    }
  }
}

/**
 * Parse any CSS color (incl. rgba()/'transparent') into normalized [r,g,b,a]
 * (0-1) via a 1x1 canvas. RGB drives the shader background; alpha < 1 switches
 * the canvas to a transparent (alpha-blended) render.
 */
export function parseCssColor(color: string): [number, number, number, number] {
  if (typeof document === 'undefined') return [0.04, 0.04, 0.04, 1]
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 1
  const ctx = canvas.getContext('2d')
  if (!ctx) return [0.04, 0.04, 0.04, 1]
  ctx.clearRect(0, 0, 1, 1)
  ctx.fillStyle = color
  ctx.fillRect(0, 0, 1, 1)
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
  return [r! / 255, g! / 255, b! / 255, a! / 255]
}
