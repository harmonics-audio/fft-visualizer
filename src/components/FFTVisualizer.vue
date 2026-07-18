<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, toRefs } from 'vue'
import { useLocalAudio } from '../composables/useLocalAudio'
import { resolveGradientStops, buildGradientLUT, GRADIENT_LUT_SIZE, type GradientInput } from '../gradients'

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
}>(), {
  mode: 'websocket',
  showPeaks: true,
  peakDecay: 0.997,
  bands: 80,
  ledBars: false,
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
  stereo: false
})

const emit = defineEmits<{
  connected: []
  disconnected: []
  error: [error: string]
}>()

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

// Aggregate bins down to fewer bands (max of each group)
function aggregateBins(source: Uint8Array, targetBands: number): Uint8Array {
  if (targetBands >= source.length) return source

  const result = new Uint8Array(targetBands)
  const ratio = source.length / targetBands

  for (let i = 0; i < targetBands; i++) {
    const startBin = Math.floor(i * ratio)
    const endBin = Math.floor((i + 1) * ratio)
    let maxVal = 0
    for (let j = startBin; j < endBin; j++) {
      if (source[j]! > maxVal) maxVal = source[j]!
    }
    result[i] = maxVal
  }
  return result
}

function aggregatePeaks(source: Float32Array, targetBands: number): Float32Array {
  if (targetBands >= source.length) return source

  const result = new Float32Array(targetBands)
  const ratio = source.length / targetBands

  for (let i = 0; i < targetBands; i++) {
    const startBin = Math.floor(i * ratio)
    const endBin = Math.floor((i + 1) * ratio)
    let maxVal = 0
    for (let j = startBin; j < endBin; j++) {
      if (source[j]! > maxVal) maxVal = source[j]!
    }
    result[i] = maxVal
  }
  return result
}

// Local audio (WASM FFT)
const localAudio = useLocalAudio({ bins: props.bands })

// WebSocket
let websocket: WebSocket | null = null
let animationId: number | null = null
let frameCount = 0
let lastFpsTime = 0

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
let uBinsLoc: WebGLUniformLocation | null = null
let uShowPeaksLoc: WebGLUniformLocation | null = null
let uLedBarsLoc: WebGLUniformLocation | null = null
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
  uniform float u_bins;
  uniform bool u_showPeaks;
  uniform bool u_ledBars;
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
  // Works for linear bars and (via polar transform in main) radial mode.
  vec4 renderBars(float x, float y, sampler2D fftTex, sampler2D peakTex, float peakHalf) {
    vec4 bgColor = vec4(0.04, 0.04, 0.04, 1.0);

    float barLocalX = fract(x * u_bins);
    if (barLocalX > (1.0 - u_barSpace)) {
      return bgColor;
    }

    float texCoord = (floor(x * u_bins) + 0.5) / u_bins;
    float fftValue = texture2D(fftTex, vec2(texCoord, 0.5)).r;
    float peakValue = texture2D(peakTex, vec2(texCoord, 0.5)).r;

    float ledSegments = 64.0;
    float ledGap = 0.25;
    float segmentY = fract(y * ledSegments);
    bool inLedGap = u_ledBars && segmentY > (1.0 - ledGap);

    if (u_lumiBars) {
      // Full-height bars whose brightness follows the level
      if (inLedGap) return bgColor;
      float gradientPos = u_barLevelColor ? fftValue : (u_gradientHorizontal ? x : y);
      vec3 color = getGradientColor(gradientPos);
      return vec4(mix(bgColor.rgb, color, fftValue), 1.0);
    }

    if (y <= fftValue) {
      if (inLedGap) return bgColor;
      float gradientPos = u_barLevelColor ? fftValue : (u_gradientHorizontal ? x : y);
      return vec4(getGradientColor(gradientPos), 1.0);
    } else if (u_showPeaks && y >= peakValue - peakHalf && y <= peakValue + peakHalf) {
      float peakGradientPos = (u_barLevelColor || !u_gradientHorizontal) ? peakValue : x;
      vec3 peakColor = getGradientColor(peakGradientPos);
      if (u_ledBars) {
        float peakSegment = floor(peakValue * ledSegments) / ledSegments;
        if (y >= peakSegment && y <= peakSegment + (1.0 / ledSegments) * (1.0 - ledGap)) {
          return vec4(peakColor, 0.5);
        }
        return bgColor;
      }
      return vec4(peakColor, 0.5);
    }

    if (u_glow > 0.0) {
      // Soft light rising from the bar top, in the bar-top's color. Faded out
      // for near-silent bars so idle columns stay dark.
      float g = u_glow * exp((fftValue - y) * 10.0) * smoothstep(0.0, 0.05, fftValue);
      vec3 glowColor = getGradientColor((u_barLevelColor || !u_gradientHorizontal) ? fftValue : x);
      return vec4(mix(bgColor.rgb, glowColor, clamp(g, 0.0, 1.0)), 1.0);
    }
    return bgColor;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    vec4 bgColor = vec4(0.04, 0.04, 0.04, 1.0);

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
      float radialDim = 1.0;
      if (r >= innerR) {
        level = (r - innerR) / (outerR - innerR);
      } else if (u_reflexRatio > 0.0) {
        // Reflection inside the inner circle: bars mirror inward at half height
        level = (innerR - r) / (outerR - innerR) * 2.0;
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
          c = renderBars(x, level, u_fftData, u_peakData, 0.006);
        } else {
          c = renderBars(x, level, u_fftDataRight, u_peakDataRight, 0.006);
        }
      } else {
        float x = angle / 6.28318531 + 0.5;
        c = renderBars(x, level, u_fftData, u_peakData, 0.006);
      }
      gl_FragColor = vec4(mix(bgColor.rgb, c.rgb, radialDim), c.a);
      return;
    }

    // Rotation (clockwise): sample the un-rotated content for this pixel.
    // Content is stretched to the canvas, so 90/270 also swap the axes' span.
    if (u_rotation > 2.5) {
      uv = vec2(uv.y, 1.0 - uv.x);
    } else if (u_rotation > 1.5) {
      uv = vec2(1.0 - uv.x, 1.0 - uv.y);
    } else if (u_rotation > 0.5) {
      uv = vec2(1.0 - uv.y, uv.x);
    }

    if (u_stereo) {
      // Thin black divider line between left and right channels
      float dividerHalf = 1.0 / u_resolution.y;
      if (abs(uv.y - 0.5) < dividerHalf) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
      }
      // Left channel grows up from center, right channel grows down from center
      if (uv.y >= 0.5) {
        gl_FragColor = renderBars(uv.x, (uv.y - 0.5) * 2.0, u_fftData, u_peakData, 0.006);
      } else {
        gl_FragColor = renderBars(uv.x, (0.5 - uv.y) * 2.0, u_fftDataRight, u_peakDataRight, 0.006);
      }
      return;
    }

    // Mono, with optional mirrored reflection in the bottom u_reflexRatio of the canvas
    float y = uv.y;
    float dim = 1.0;
    if (u_reflexRatio > 0.0) {
      if (uv.y < u_reflexRatio) {
        // Reflection is squashed to half the main bar height
        y = (u_reflexRatio - uv.y) / (1.0 - u_reflexRatio) * 2.0;
        dim = u_reflexAlpha;
      } else {
        y = (uv.y - u_reflexRatio) / (1.0 - u_reflexRatio);
      }
    }
    vec4 c = renderBars(uv.x, y, u_fftData, u_peakData, 0.003);
    gl_FragColor = vec4(mix(bgColor.rgb, c.rgb, dim), c.a);
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

  gl = canvas.getContext('webgl', {
    antialias: false,
    alpha: false,
    preserveDrawingBuffer: false
  })

  if (!gl) {
    console.error('WebGL not supported')
    return false
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
  uBinsLoc = gl.getUniformLocation(program, 'u_bins')
  uShowPeaksLoc = gl.getUniformLocation(program, 'u_showPeaks')
  uLedBarsLoc = gl.getUniformLocation(program, 'u_ledBars')
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
  // Apply noise floor threshold
  const threshold = currentNoiseFloor.value
  for (let i = 0; i < newData.length; i++) {
    newData[i] = newData[i]! > threshold ? newData[i]! - threshold : 0
  }
  // Rescale to use full range after threshold
  if (threshold > 0) {
    const scale = 255 / (255 - threshold)
    for (let i = 0; i < newData.length; i++) {
      newData[i] = Math.min(255, Math.floor(newData[i]! * scale))
    }
  }

  // Apply temporal smoothing
  const smooth = currentSmoothing.value
  if (smooth > 0) {
    for (let i = 0; i < newData.length; i++) {
      smoothedRef.value[i] = smooth * smoothedRef.value[i]! + (1 - smooth) * newData[i]!
      newData[i] = Math.floor(smoothedRef.value[i]!)
    }
  }
  fftRef.value = newData

  // Update peaks
  for (let i = 0; i < newData.length; i++) {
    const value = newData[i]! / 255
    if (value > peakRef.value[i]!) {
      peakRef.value[i] = value
    } else {
      peakRef.value[i]! *= currentPeakDecay.value
    }
  }

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

function connectWebSocket() {
  if (websocket || !props.websocketUrl) return

  console.log('[FFTVisualizer] Connecting to:', props.websocketUrl)
  websocket = new WebSocket(props.websocketUrl)
  websocket.binaryType = 'arraybuffer'

  websocket.onopen = () => {
    console.log('[FFTVisualizer] Connected')
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
          console.log(`[FFTVisualizer] Config: ${config.bins} server bins, displaying ${displayBins.value} bands @ ${config.fps}fps`)
        }
      } catch (e) {
        console.warn('[FFTVisualizer] Failed to parse config:', e)
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
    console.error('[FFTVisualizer] Error:', event)
    emit('error', 'WebSocket connection error')
  }

  websocket.onclose = () => {
    console.log('[FFTVisualizer] Disconnected')
    isConnected.value = false
    websocket = null
    emit('disconnected')
    stopRendering()
  }
}

function disconnectWebSocket() {
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
    console.error('[FFTVisualizer] Local audio error:', e)
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

function peakToUint8(peakRef: Float32Array, numBins: number): Uint8Array {
  const result = new Uint8Array(numBins)
  for (let i = 0; i < numBins; i++) {
    result[i] = Math.min(255, Math.floor(peakRef[i]! * 255))
  }
  return result
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
  gl.uniform1f(uBinsLoc, numBins)
  gl.uniform1i(uShowPeaksLoc, currentShowPeaks.value ? 1 : 0)
  gl.uniform1i(uLedBarsLoc, currentLedBars.value ? 1 : 0)
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

  // Draw
  gl.viewport(0, 0, canvas.width, canvas.height)
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
    console.error('[FFTVisualizer] Failed to initialize WebGL')
    emit('error', 'WebGL initialization failed')
    return
  }

  window.addEventListener('resize', handleResize)
  connect()
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
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

// Expose methods for external control
defineExpose({
  connect,
  disconnect,
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
  >
    <canvas
      ref="canvasRef"
      class="fft-canvas"
    />
    <div class="fft-stats">
      <span v-if="isConnected" class="connected">{{ displayBins }} bands @ {{ fps }}fps</span>
      <span v-else class="disconnected">Disconnected</span>
    </div>
  </div>
</template>

<style scoped>
.fft-visualizer {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 100px;
  background: #0a0a0a;
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
