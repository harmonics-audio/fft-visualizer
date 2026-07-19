<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, toRefs } from 'vue'
import { useLocalAudio } from '../composables/useLocalAudio'
import { resolveGradientStops, buildGradientLUT, GRADIENT_LUT_SIZE, type GradientInput } from '../gradients'
import {
  aggregateBins,
  aggregatePeaks,
  peakToUint8,
  applyNoiseFloor,
  applySmoothing,
  updatePeaks
} from '../processing'

/**
 * FFT Visualizer - High-performance WebGL spectrum analyzer
 *
 * Supports three modes:
 * - 'websocket': Receives pre-computed FFT data via WebSocket (default)
 * - 'local': Captures audio from microphone and computes FFT in-browser via Rust WASM
 * - 'external': Receives externally provided FFT data via props
 *
 * WebSocket Protocol (mode='websocket'):
 * 1. Connect to websocketUrl
 * 2. Server sends config: {"type":"config","mode":"fft","bins":80,"fps":120}
 * 3. Server streams binary: N bytes of uint8 (frequency magnitudes 0-255)
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
}>()

// Diagnostics: only logged when the `debug` prop is set, so consumers get a
// quiet console by default. Real failures are also surfaced via the `error` event.
function debugLog(...args: unknown[]) {
  if (props.debug) console.log('[FFTVisualizer]', ...args)
}

// Background color for the shader, parsed from the `background` prop via a canvas
// so any CSS color (incl. rgba()/'transparent') works. RGB drives u_bgColor; alpha
// < 1 switches the canvas to a transparent (alpha-blended) render.
const bgColorRgb = ref<[number, number, number]>([0.04, 0.04, 0.04])
const bgAlpha = ref(1)

function parseCssColor(color: string): [number, number, number, number] {
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

// Canvas and WebGL
const canvasRef = ref<HTMLCanvasElement>()
const containerRef = ref<HTMLElement>()
const isConnected = ref(false)
const fps = ref(0)

// FFT data (server sends N bins, we aggregate for display)
const serverBins = ref(80)

// Mono data
const fftData = ref<Uint8Array>(new Uint8Array(80))
const smoothedFftData = ref<Float32Array>(new Float32Array(80))
const peakData = ref<Float32Array>(new Float32Array(80))

// Stereo data (left/right channels)
const fftDataLeft = ref<Uint8Array>(new Uint8Array(80))
const smoothedFftDataLeft = ref<Float32Array>(new Float32Array(80))
const peakDataLeft = ref<Float32Array>(new Float32Array(80))
const fftDataRight = ref<Uint8Array>(new Uint8Array(80))
const smoothedFftDataRight = ref<Float32Array>(new Float32Array(80))
const peakDataRight = ref<Float32Array>(new Float32Array(80))

// Display data (aggregated to props.bands)
const displayBins = computed(() => props.bands)
const displayFftData = ref<Uint8Array>(new Uint8Array(props.bands))
const displayPeakData = ref<Float32Array>(new Float32Array(props.bands))
const displayFftDataLeft = ref<Uint8Array>(new Uint8Array(props.bands))
const displayPeakDataLeft = ref<Float32Array>(new Float32Array(props.bands))
const displayFftDataRight = ref<Uint8Array>(new Uint8Array(props.bands))
const displayPeakDataRight = ref<Float32Array>(new Float32Array(props.bands))

// Local audio (WASM FFT)
const localAudio = useLocalAudio({ bins: props.bands })

// WebSocket
let websocket: WebSocket | null = null
let animationId: number | null = null
let frameCount = 0
let lastFpsTime = 0

// Auto-reconnect (exponential backoff, opt-in via the autoReconnect prop)
let reconnectAttempts = 0
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
const RECONNECT_BASE_MS = 1000
const RECONNECT_MAX_MS = 30000

// Resize observation
let resizeObserver: ResizeObserver | null = null

// True when the canvas uses an alpha context (transparent background)
let transparentMode = false

// WebGL state
let gl: WebGLRenderingContext | null = null
let program: WebGLProgram | null = null
let positionBuffer: WebGLBuffer | null = null
let fftTexture: WebGLTexture | null = null
let peakTexture: WebGLTexture | null = null
let fftTextureRight: WebGLTexture | null = null
let peakTextureRight: WebGLTexture | null = null
let gradientTexture: WebGLTexture | null = null

// Shader locations
let uResolutionLoc: WebGLUniformLocation | null = null
let uDprLoc: WebGLUniformLocation | null = null
let uBgColorLoc: WebGLUniformLocation | null = null
let uBgAlphaLoc: WebGLUniformLocation | null = null
let uBinsLoc: WebGLUniformLocation | null = null
let uShowPeaksLoc: WebGLUniformLocation | null = null
let uLedBarsLoc: WebGLUniformLocation | null = null
let uLedMeterLoc: WebGLUniformLocation | null = null
let uLumiBarsLoc: WebGLUniformLocation | null = null
let uRadialLoc: WebGLUniformLocation | null = null
let uRadialInnerLoc: WebGLUniformLocation | null = null
let uBarSpaceLoc: WebGLUniformLocation | null = null
let uReflexRatioLoc: WebGLUniformLocation | null = null
let uReflexAlphaLoc: WebGLUniformLocation | null = null
let uGlowLoc: WebGLUniformLocation | null = null
let uRotationLoc: WebGLUniformLocation | null = null
let uGradientTexLoc: WebGLUniformLocation | null = null
let uGradientHorizontalLoc: WebGLUniformLocation | null = null
let uBarLevelColorLoc: WebGLUniformLocation | null = null
let uStereoLoc: WebGLUniformLocation | null = null
let uFftDataLoc: WebGLUniformLocation | null = null
let uPeakDataLoc: WebGLUniformLocation | null = null
let uFftDataRightLoc: WebGLUniformLocation | null = null
let uPeakDataRightLoc: WebGLUniformLocation | null = null

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

function createShader(glCtx: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
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

function createTexture(glCtx: WebGLRenderingContext, nearest = false): WebGLTexture | null {
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

function initWebGL(): boolean {
  const canvas = canvasRef.value
  if (!canvas) return false

  // Transparent background needs an alpha context + straight-alpha blending.
  // Opaque (the default) keeps alpha:false so behavior is unchanged.
  transparentMode = bgAlpha.value < 1
  gl = canvas.getContext('webgl', {
    antialias: false,
    alpha: transparentMode,
    premultipliedAlpha: false,
    // Keep the rendered frame readable so consumers can screenshot the canvas
    // (canvas.toDataURL) and pixel tests are deterministic. The component fully
    // redraws every frame, so there is no visual difference.
    preserveDrawingBuffer: true
  })

  if (!gl) {
    console.error('WebGL not supported')
    return false
  }

  if (transparentMode) {
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
  }

  // Create shaders
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource)
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource)

  if (!vertexShader || !fragmentShader) return false

  // Create program
  program = gl.createProgram()
  if (!program) return false

  gl.attachShader(program, vertexShader)
  gl.attachShader(program, fragmentShader)
  gl.linkProgram(program)

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Program link error:', gl.getProgramInfoLog(program))
    return false
  }

  gl.useProgram(program)

  // Create full-screen quad
  positionBuffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
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
  uResolutionLoc = gl.getUniformLocation(program, 'u_resolution')
  uDprLoc = gl.getUniformLocation(program, 'u_dpr')
  uBgColorLoc = gl.getUniformLocation(program, 'u_bgColor')
  uBgAlphaLoc = gl.getUniformLocation(program, 'u_bgAlpha')
  uBinsLoc = gl.getUniformLocation(program, 'u_bins')
  uShowPeaksLoc = gl.getUniformLocation(program, 'u_showPeaks')
  uLedBarsLoc = gl.getUniformLocation(program, 'u_ledBars')
  uLedMeterLoc = gl.getUniformLocation(program, 'u_ledMeter')
  uLumiBarsLoc = gl.getUniformLocation(program, 'u_lumiBars')
  uRadialLoc = gl.getUniformLocation(program, 'u_radial')
  uRadialInnerLoc = gl.getUniformLocation(program, 'u_radialInner')
  uBarSpaceLoc = gl.getUniformLocation(program, 'u_barSpace')
  uReflexRatioLoc = gl.getUniformLocation(program, 'u_reflexRatio')
  uReflexAlphaLoc = gl.getUniformLocation(program, 'u_reflexAlpha')
  uGlowLoc = gl.getUniformLocation(program, 'u_glow')
  uRotationLoc = gl.getUniformLocation(program, 'u_rotation')
  uGradientTexLoc = gl.getUniformLocation(program, 'u_gradientTex')
  uGradientHorizontalLoc = gl.getUniformLocation(program, 'u_gradientHorizontal')
  uBarLevelColorLoc = gl.getUniformLocation(program, 'u_barLevelColor')
  uStereoLoc = gl.getUniformLocation(program, 'u_stereo')
  uFftDataLoc = gl.getUniformLocation(program, 'u_fftData')
  uPeakDataLoc = gl.getUniformLocation(program, 'u_peakData')
  uFftDataRightLoc = gl.getUniformLocation(program, 'u_fftDataRight')
  uPeakDataRightLoc = gl.getUniformLocation(program, 'u_peakDataRight')

  // Create textures (left/mono = 0,1 — right = 2,3)
  gl.activeTexture(gl.TEXTURE0)
  fftTexture = createTexture(gl)
  gl.activeTexture(gl.TEXTURE1)
  peakTexture = createTexture(gl, true)
  gl.activeTexture(gl.TEXTURE2)
  fftTextureRight = createTexture(gl)
  gl.activeTexture(gl.TEXTURE3)
  peakTextureRight = createTexture(gl, true)
  gl.activeTexture(gl.TEXTURE4)
  gradientTexture = createTexture(gl)

  // Set texture units
  gl.uniform1i(uFftDataLoc, 0)
  gl.uniform1i(uPeakDataLoc, 1)
  gl.uniform1i(uFftDataRightLoc, 2)
  gl.uniform1i(uPeakDataRightLoc, 3)
  gl.uniform1i(uGradientTexLoc, 4)

  uploadGradientTexture()

  return true
}

// Rasterize the current gradient (preset or custom stops) into the LUT texture
function uploadGradientTexture() {
  if (!gl || !gradientTexture) return
  const lut = buildGradientLUT(resolveGradientStops(props.gradient))
  gl.activeTexture(gl.TEXTURE4)
  gl.bindTexture(gl.TEXTURE_2D, gradientTexture)
  gl.texImage2D(
    gl.TEXTURE_2D, 0, gl.RGBA,
    GRADIENT_LUT_SIZE, 1, 0,
    gl.RGBA, gl.UNSIGNED_BYTE,
    lut
  )
}

// Process raw FFT data: apply noise floor, smoothing, peaks, and aggregate
function processFFTData(
  newData: Uint8Array,
  smoothedRef: { value: Float32Array },
  peakRef: { value: Float32Array },
  fftRef: { value: Uint8Array },
  displayFftRef: { value: Uint8Array },
  displayPeakRef: { value: Float32Array }
) {
  applyNoiseFloor(newData, currentNoiseFloor.value)
  applySmoothing(newData, smoothedRef.value, currentSmoothing.value)
  fftRef.value = newData
  updatePeaks(peakRef.value, newData, currentPeakDecay.value)

  // Aggregate to display bands
  displayFftRef.value = aggregateBins(fftRef.value, displayBins.value)
  displayPeakRef.value = aggregatePeaks(peakRef.value, displayBins.value)
}

function processMonoData(newData: Uint8Array) {
  processFFTData(newData, smoothedFftData, peakData, fftData, displayFftData, displayPeakData)
  // When stereo is enabled but only mono data is available, mirror to both channels
  if (currentStereo.value) {
    displayFftDataLeft.value = displayFftData.value
    displayPeakDataLeft.value = displayPeakData.value
    displayFftDataRight.value = displayFftData.value
    displayPeakDataRight.value = displayPeakData.value
  }
  frameCount++
}

function processLeftData(newData: Uint8Array) {
  processFFTData(newData, smoothedFftDataLeft, peakDataLeft, fftDataLeft, displayFftDataLeft, displayPeakDataLeft)
}

function processRightData(newData: Uint8Array) {
  processFFTData(newData, smoothedFftDataRight, peakDataRight, fftDataRight, displayFftDataRight, displayPeakDataRight)
  frameCount++
}

function initBuffers(size: number) {
  serverBins.value = size
  fftData.value = new Uint8Array(size)
  smoothedFftData.value = new Float32Array(size)
  peakData.value = new Float32Array(size)
  fftDataLeft.value = new Uint8Array(size)
  smoothedFftDataLeft.value = new Float32Array(size)
  peakDataLeft.value = new Float32Array(size)
  fftDataRight.value = new Uint8Array(size)
  smoothedFftDataRight.value = new Float32Array(size)
  peakDataRight.value = new Float32Array(size)
  displayFftData.value = new Uint8Array(displayBins.value)
  displayPeakData.value = new Float32Array(displayBins.value)
  displayFftDataLeft.value = new Uint8Array(displayBins.value)
  displayPeakDataLeft.value = new Float32Array(displayBins.value)
  displayFftDataRight.value = new Uint8Array(displayBins.value)
  displayPeakDataRight.value = new Float32Array(displayBins.value)
}

function scheduleReconnect() {
  if (!props.autoReconnect || props.mode !== 'websocket') return
  if (reconnectTimer) clearTimeout(reconnectTimer)

  const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** reconnectAttempts)
  reconnectAttempts++
  debugLog(`Reconnecting in ${delay}ms (attempt ${reconnectAttempts})`)
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    if (props.mode === 'websocket') connectWebSocket()
  }, delay)
}

function connectWebSocket() {
  if (websocket || !props.websocketUrl) return

  debugLog('Connecting to:', props.websocketUrl)
  websocket = new WebSocket(props.websocketUrl)
  websocket.binaryType = 'arraybuffer'

  websocket.onopen = () => {
    debugLog('Connected')
    reconnectAttempts = 0
    isConnected.value = true
    emit('connected')
    startRendering()
  }

  websocket.onmessage = (event) => {
    const data = event.data

    // Handle config message
    if (typeof data === 'string') {
      try {
        const config = JSON.parse(data)
        if (config.type === 'config' && config.mode === 'fft') {
          initBuffers(config.bins || 80)
          debugLog(`Config: ${config.bins} server bins, displaying ${displayBins.value} bands @ ${config.fps}fps`)
        }
      } catch (e) {
        debugLog('Failed to parse config:', e)
      }
      return
    }

    // Handle binary FFT data
    if (data instanceof ArrayBuffer) {
      const newData = new Uint8Array(data)
      if (newData.length === serverBins.value) {
        processMonoData(newData)
      }
    }
  }

  websocket.onerror = (event) => {
    debugLog('WebSocket error:', event)
    emit('error', 'WebSocket connection error')
  }

  websocket.onclose = () => {
    debugLog('Disconnected')
    isConnected.value = false
    websocket = null
    emit('disconnected')
    stopRendering()
    // Only fires for unexpected closes — manual disconnect nulls this handler first
    scheduleReconnect()
  }
}

function disconnectWebSocket() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  reconnectAttempts = 0
  if (websocket) {
    websocket.onopen = null
    websocket.onmessage = null
    websocket.onerror = null
    websocket.onclose = null
    websocket.close()
    websocket = null
  }
  stopRendering()
  isConnected.value = false
}

async function startLocalAudio() {
  try {
    if (props.audioSource === 'display') {
      await localAudio.startDisplay()
    } else {
      await localAudio.start(props.audioDeviceId)
    }
    isConnected.value = true
    emit('connected')
    startRendering()
  } catch (e) {
    debugLog('Local audio error:', e)
    emit('error', e instanceof Error ? e.message : 'Failed to start local audio')
  }
}

function stopLocalAudio() {
  localAudio.stop()
  stopRendering()
  isConnected.value = false
  emit('disconnected')
}

function connect() {
  if (props.mode === 'local') {
    startLocalAudio()
  } else if (props.mode === 'external') {
    isConnected.value = true
    emit('connected')
    startRendering()
  } else {
    connectWebSocket()
  }
}

function disconnect() {
  if (props.mode === 'local') {
    stopLocalAudio()
  } else if (props.mode === 'external') {
    stopRendering()
    isConnected.value = false
    emit('disconnected')
  } else {
    disconnectWebSocket()
  }
}

function startRendering() {
  if (animationId) return

  const render = () => {
    drawSpectrum()
    animationId = requestAnimationFrame(render)

    // Calculate FPS
    const now = performance.now()
    if (now - lastFpsTime >= 1000) {
      fps.value = frameCount
      frameCount = 0
      lastFpsTime = now
    }
  }

  lastFpsTime = performance.now()
  frameCount = 0
  render()
}

function stopRendering() {
  if (animationId) {
    cancelAnimationFrame(animationId)
    animationId = null
  }
}

function uploadTexture(unit: number, texture: WebGLTexture | null, data: Uint8Array, numBins: number) {
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

function drawSpectrum() {
  if (!gl || !program) return

  const canvas = canvasRef.value
  if (!canvas) return

  const numBins = displayBins.value
  const isStereo = currentStereo.value

  if (isStereo) {
    // Upload left channel data
    uploadTexture(0, fftTexture, displayFftDataLeft.value, numBins)
    uploadTexture(1, peakTexture, peakToUint8(displayPeakDataLeft.value, numBins), numBins)
    // Upload right channel data
    uploadTexture(2, fftTextureRight, displayFftDataRight.value, numBins)
    uploadTexture(3, peakTextureRight, peakToUint8(displayPeakDataRight.value, numBins), numBins)
  } else {
    // Upload mono data
    uploadTexture(0, fftTexture, displayFftData.value, numBins)
    uploadTexture(1, peakTexture, peakToUint8(displayPeakData.value, numBins), numBins)
  }

  // Set uniforms
  gl.uniform2f(uResolutionLoc, canvas.width, canvas.height)
  gl.uniform1f(uDprLoc, window.devicePixelRatio || 1)
  gl.uniform3f(uBgColorLoc, bgColorRgb.value[0], bgColorRgb.value[1], bgColorRgb.value[2])
  gl.uniform1f(uBgAlphaLoc, bgAlpha.value)
  gl.uniform1f(uBinsLoc, numBins)
  gl.uniform1i(uShowPeaksLoc, currentShowPeaks.value ? 1 : 0)
  gl.uniform1i(uLedBarsLoc, currentLedBars.value ? 1 : 0)
  gl.uniform1i(uLedMeterLoc, currentLedShape.value === 'meter' ? 1 : 0)
  gl.uniform1i(uLumiBarsLoc, currentLumiBars.value ? 1 : 0)
  gl.uniform1i(uRadialLoc, currentRadial.value ? 1 : 0)
  gl.uniform1f(uRadialInnerLoc, Math.min(0.9, Math.max(0, currentRadialInnerRadius.value)))
  gl.uniform1f(uBarSpaceLoc, Math.min(0.9, Math.max(0, currentBarSpace.value)))
  gl.uniform1f(uReflexRatioLoc, Math.min(0.7, Math.max(0, currentReflexRatio.value)))
  gl.uniform1f(uReflexAlphaLoc, Math.min(1, Math.max(0, currentReflexAlpha.value)))
  gl.uniform1f(uGlowLoc, Math.min(1, Math.max(0, currentGlow.value)))
  gl.uniform1f(uRotationLoc, (Math.round(currentRotation.value / 90) % 4 + 4) % 4)
  gl.uniform1i(uGradientHorizontalLoc, currentGradientDirection.value === 'horizontal' ? 1 : 0)
  gl.uniform1i(uBarLevelColorLoc, currentColorMode.value === 'bar-level' ? 1 : 0)
  gl.uniform1i(uStereoLoc, isStereo ? 1 : 0)

  // Draw. In transparent mode, clear first so blended fragments don't accumulate
  // across frames (opaque mode's full-screen quad overwrites every pixel anyway).
  gl.viewport(0, 0, canvas.width, canvas.height)
  if (transparentMode) {
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
  }
  gl.drawArrays(gl.TRIANGLES, 0, 6)
}

function handleResize() {
  const canvas = canvasRef.value
  const container = containerRef.value
  if (!canvas || !container) return

  const rect = container.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1

  canvas.width = rect.width * dpr
  canvas.height = rect.height * dpr
  canvas.style.width = `${rect.width}px`
  canvas.style.height = `${rect.height}px`

  if (gl) {
    gl.viewport(0, 0, canvas.width, canvas.height)
  }
}

// Create reactive refs from props using toRefs
const {
  showPeaks: currentShowPeaks,
  peakDecay: currentPeakDecay,
  ledBars: currentLedBars,
  ledShape: currentLedShape,
  lumiBars: currentLumiBars,
  radial: currentRadial,
  radialInnerRadius: currentRadialInnerRadius,
  barSpace: currentBarSpace,
  reflexRatio: currentReflexRatio,
  reflexAlpha: currentReflexAlpha,
  glow: currentGlow,
  rotation: currentRotation,
  gradientDirection: currentGradientDirection,
  colorMode: currentColorMode,
  noiseFloor: currentNoiseFloor,
  smoothing: currentSmoothing,
  stereo: currentStereo
} = toRefs(props)

// Rebuild the gradient LUT when the gradient prop changes (deep: custom stop
// arrays may be mutated in place by settings UIs)
watch(() => props.gradient, uploadGradientTexture, { deep: true })

// Reparse the background color when the prop changes (immediate: seed on setup).
// Note: opaque vs transparent is fixed at mount (context alpha can't change live).
watch(() => props.background, (c) => {
  const [r, g, b, a] = parseCssColor(c)
  bgColorRgb.value = [r, g, b]
  bgAlpha.value = a
}, { immediate: true })

// Watch for bands prop changes
watch(() => props.bands, (newBands) => {
  displayFftData.value = new Uint8Array(newBands)
  displayPeakData.value = new Float32Array(newBands)
  displayFftDataLeft.value = new Uint8Array(newBands)
  displayPeakDataLeft.value = new Float32Array(newBands)
  displayFftDataRight.value = new Uint8Array(newBands)
  displayPeakDataRight.value = new Float32Array(newBands)
})

// Watch local audio FFT data and feed into processing pipeline
watch(localAudio.fftData, (newData) => {
  if (props.mode !== 'local' || !localAudio.isActive.value) return

  if (newData.length !== serverBins.value) {
    initBuffers(newData.length)
  }

  processMonoData(new Uint8Array(newData))
})

// Watch external data prop (mono) and feed into processing pipeline
watch(() => props.data, (newData) => {
  if (props.mode !== 'external' || !newData) return

  if (newData.length !== serverBins.value) {
    initBuffers(newData.length)
  }

  processMonoData(new Uint8Array(newData))
})

// Watch external left channel data
watch(() => props.dataLeft, (newData) => {
  if (props.mode !== 'external' || !newData) return

  if (newData.length !== serverBins.value) {
    initBuffers(newData.length)
  }

  processLeftData(new Uint8Array(newData))
})

// Watch external right channel data
watch(() => props.dataRight, (newData) => {
  if (props.mode !== 'external' || !newData) return

  if (newData.length !== serverBins.value) {
    initBuffers(newData.length)
  }

  processRightData(new Uint8Array(newData))
})

// Detect when display sharing is stopped via browser UI
watch(localAudio.isActive, (active) => {
  if (!active && isConnected.value && props.mode === 'local') {
    stopRendering()
    isConnected.value = false
    emit('disconnected')
  }
})

// Watch for websocketUrl changes - reconnect
watch(() => props.websocketUrl, () => {
  if (props.mode === 'websocket') {
    disconnect()
    connect()
  }
})

// Watch for mode changes - switch data source
watch(() => props.mode, () => {
  disconnect()
  connect()
})

onMounted(() => {
  handleResize()

  if (!initWebGL()) {
    debugLog('Failed to initialize WebGL')
    emit('error', 'WebGL initialization failed')
    return
  }

  // Observe the container so the canvas rescales on any layout change
  // (flex/grid resize, sidebar toggle, …), not just window resizes.
  if (containerRef.value && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(handleResize)
    resizeObserver.observe(containerRef.value)
  } else {
    window.addEventListener('resize', handleResize)
  }
  connect()
})

onUnmounted(() => {
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  } else {
    window.removeEventListener('resize', handleResize)
  }
  disconnect()

  // Cleanup WebGL resources
  if (gl) {
    if (fftTexture) gl.deleteTexture(fftTexture)
    if (peakTexture) gl.deleteTexture(peakTexture)
    if (fftTextureRight) gl.deleteTexture(fftTextureRight)
    if (peakTextureRight) gl.deleteTexture(peakTextureRight)
    if (gradientTexture) gl.deleteTexture(gradientTexture)
    if (positionBuffer) gl.deleteBuffer(positionBuffer)
    if (program) gl.deleteProgram(program)
  }
})

// Imperatively feed FFT frames (0-255 magnitudes). Preferred over the `data`
// prop when you mutate one buffer in place each frame — the prop is watched by
// reference and won't react to in-place mutation. Pass `left` and `right` for
// stereo. Data is copied, so the caller may reuse its buffers.
function feedData(data: Uint8Array, left?: Uint8Array, right?: Uint8Array) {
  if (left && right) {
    if (left.length !== serverBins.value) initBuffers(left.length)
    processLeftData(new Uint8Array(left))
    processRightData(new Uint8Array(right))
  } else {
    if (data.length !== serverBins.value) initBuffers(data.length)
    processMonoData(new Uint8Array(data))
  }
}

// Expose methods for external control
defineExpose({
  connect,
  disconnect,
  feedData,
  isConnected,
  audioDevices: localAudio.devices,
  activeAudioDeviceId: localAudio.activeDeviceId,
  getAudioDevices: localAudio.getDevices
})
</script>

<template>
  <div
    ref="containerRef"
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
