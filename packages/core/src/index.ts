// Core visualizer class + options/events
export { FFTVisualizer, parseCssColor } from './FFTVisualizer'
export type {
  FFTVisualizerOptions,
  FFTVisualizerEventMap,
  FrameEvent,
  VisualizerMode,
  BandCount
} from './FFTVisualizer'

// Local audio (mic / system) engine
export { createLocalAudio } from './localAudio'
export type { LocalAudioEngine, LocalAudioOptions, AudioDevice, AudioSourceType } from './localAudio'

// Client-side FFT of a PCM WebSocket stream
export { createWebSocketFft } from './webSocketFft'
export type { WebSocketFftEngine, WebSocketFftOptions } from './webSocketFft'

// PCM helpers
export { pcmToChannels } from './pcm'
export type { PcmChannels } from './pcm'

// Gradient helpers
export { gradientPresets, gradientNames, resolveGradientStops, buildGradientLUT, GRADIENT_LUT_SIZE } from './gradients'
export type { GradientStop, GradientName, GradientInput } from './gradients'

// NOTE: the Rust/WASM FftProcessor is intentionally NOT re-exported here.
// A static re-export would statically import the WASM module into the main
// entry, forcing the whole bundle (including the FFTVisualizer class) under a
// top-level await and eagerly loading ~289 kB of WASM. The class loads WASM
// lazily (dynamic import) only for local/websocket-FFT modes. Consumers who
// want the raw processor import it from the dedicated subpath:
//   import { FftProcessor } from 'fft-visualizer-core/wasm'
