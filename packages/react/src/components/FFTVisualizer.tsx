import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode
} from 'react'
import {
  FFTVisualizer as FFTVisualizerCore,
  type FFTVisualizerOptions,
  type AudioDevice
} from 'fft-visualizer-core'
import './FFTVisualizer.css'

/**
 * FFT Visualizer — thin React wrapper around the framework-agnostic
 * {@link FFTVisualizerCore} WebGL renderer. Props *are* the core's options (plus
 * a few React-only extras); the core owns all rendering, audio, and WebSocket
 * logic.
 *
 * Supports three modes:
 * - 'websocket': receives pre-computed FFT data via WebSocket (default)
 * - 'local': captures audio from mic/system and computes FFT in-browser via Rust WASM
 * - 'external': receives externally provided FFT data via props
 */

export interface FFTVisualizerProps extends FFTVisualizerOptions {
  /** Show the small connection/fps stats overlay in the corner */
  showStats?: boolean
  /** Extra class names on the root element (the built-in `fft-visualizer` class is kept) */
  className?: string
  /** Extra styles on the root element (merged over the `background` option) */
  style?: CSSProperties
  /** Data source became active (WS connected / capture started / external started) */
  onConnected?: () => void
  /** Data source stopped */
  onDisconnected?: () => void
  /** Error message (WS error, capture failure, WebGL init failure) */
  onError?: (error: string) => void
  /**
   * Called once per processed audio frame with the display bar magnitudes (0-255),
   * one entry per bar (`bands`). In mono modes `left`/`right` are null; in stereo
   * `data` is the per-bar max of both channels and `left`/`right` carry each side.
   */
  onFrame?: (data: Uint8Array, left: Uint8Array | null, right: Uint8Array | null) => void
  /** Replace the default stats overlay content (only rendered when `showStats`) */
  renderStats?: (state: { connected: boolean, bands: number, fps: number }) => ReactNode
}

/** Imperative API reachable through a ref on the component. */
export interface FFTVisualizerHandle {
  connect: () => void
  disconnect: () => void
  /** Feed FFT frames imperatively (mode='external'); the data is copied, so buffers can be reused */
  feedData: (data: Uint8Array, left?: Uint8Array, right?: Uint8Array) => void
  /** Enumerate audio input devices (prompts for mic permission if needed) */
  getAudioDevices: () => Promise<AudioDevice[]>
  readonly isConnected: boolean
  readonly audioDevices: AudioDevice[]
  readonly activeAudioDeviceId: string | undefined
}

// Mirrors of the core's defaults, needed only for what this wrapper renders
// itself (the aria-label, the stats text, the root element's background).
const DEFAULT_BANDS = 80
const DEFAULT_BACKGROUND = '#0a0a0a'

/**
 * Drop unset props. The core merges its defaults once, in its constructor, so a
 * key explicitly set to `undefined` would clobber a default rather than leave it
 * alone.
 */
function definedOptions(options: FFTVisualizerOptions): FFTVisualizerOptions {
  return Object.fromEntries(
    Object.entries(options).filter(([, value]) => value !== undefined)
  ) as FFTVisualizerOptions
}

const FFTVisualizer = forwardRef<FFTVisualizerHandle, FFTVisualizerProps>(
  function FFTVisualizer(props, ref) {
    const {
      showStats = true,
      className,
      style,
      onConnected,
      onDisconnected,
      onError,
      onFrame,
      renderStats,
      // Handled by its own value-compared effect below, so it stays out of the
      // bulk update object.
      gradient,
      ...options
    } = props

    const canvasRef = useRef<HTMLCanvasElement>(null)
    const vizRef = useRef<FFTVisualizerCore | null>(null)
    const [isConnected, setIsConnected] = useState(false)
    const [fps, setFps] = useState(0)

    // Latest callbacks, so the core subscriptions below can be made once at mount
    // instead of resubscribing whenever an inline handler changes identity.
    const handlers = useRef({ onConnected, onDisconnected, onError, onFrame })
    useEffect(() => {
      handlers.current = { onConnected, onDisconnected, onError, onFrame }
    })

    // Mount only: the WebGL context's alpha flag is fixed at construction and the
    // constructor opens the initial connection, so the core is built from the
    // first render's options and kept in sync by the effects below.
    useEffect(() => {
      const canvas = canvasRef.current
      if (!canvas) return

      const viz = new FFTVisualizerCore(canvas, definedOptions({ ...options, gradient }))
      vizRef.current = viz

      viz.on('connected', () => { setIsConnected(true); handlers.current.onConnected?.() })
      viz.on('disconnected', () => { setIsConnected(false); handlers.current.onDisconnected?.() })
      viz.on('error', (msg) => handlers.current.onError?.(msg))
      viz.on('frame', ({ data, left, right }) => handlers.current.onFrame?.(data, left, right))

      setIsConnected(viz.isConnected)

      // Poll the core's FPS counter for the stats overlay (updated once per second)
      const fpsTimer = setInterval(() => setFps(viz.fps), 500)

      return () => {
        clearInterval(fpsTimer)
        viz.destroy()
        vizRef.current = null
      }
    }, [])

    // Bulk-forward prop changes to the core after every render — per-key diffing
    // lives in setOptions, so re-sending unchanged values costs nothing.
    useEffect(() => {
      vizRef.current?.setOptions(definedOptions(options))
    })

    // An inline stops array gets a new identity on every render, and the core
    // reloads its LUT whenever the gradient reference changes — so compare by
    // value and only push a gradient that actually changed.
    const gradientKey = typeof gradient === 'string' ? gradient : JSON.stringify(gradient)
    useEffect(() => {
      const viz = vizRef.current
      if (!viz || gradient === undefined) return
      viz.setOptions({ gradient })
      viz.refreshGradient()
    }, [gradientKey])

    useImperativeHandle(ref, () => ({
      connect: () => vizRef.current?.connect(),
      disconnect: () => vizRef.current?.disconnect(),
      feedData: (data, left, right) => vizRef.current?.feedData(data, left, right),
      getAudioDevices: () => vizRef.current?.getAudioDevices() ?? Promise.resolve([]),
      get isConnected() { return vizRef.current?.isConnected ?? false },
      get audioDevices() { return vizRef.current?.audioDevices ?? [] },
      get activeAudioDeviceId() { return vizRef.current?.activeAudioDeviceId }
    }), [])

    const bands = options.bands ?? DEFAULT_BANDS

    return (
      <div
        className={className ? `fft-visualizer ${className}` : 'fft-visualizer'}
        style={{ background: options.background ?? DEFAULT_BACKGROUND, ...style }}
      >
        <canvas
          ref={canvasRef}
          className="fft-canvas"
          role="img"
          aria-label={isConnected
            ? `Audio spectrum visualization, ${bands} bands`
            : 'Audio spectrum visualizer (inactive)'}
        />
        {showStats && (
          <div className="fft-stats">
            {renderStats
              ? renderStats({ connected: isConnected, bands, fps })
              : isConnected
                ? <span className="fft-stats-connected">{bands} bands @ {fps}fps</span>
                : <span className="fft-stats-disconnected">Disconnected</span>}
          </div>
        )}
      </div>
    )
  }
)

export default FFTVisualizer
