import FFTVisualizer from './components/FFTVisualizer.vue'

export { FFTVisualizer }

// Vue composables (thin wrappers over the fft-visualizer-core engines)
export { useLocalAudio } from './composables/useLocalAudio'
export type { AudioDevice, AudioSourceType, LocalAudioOptions, LocalAudioReturn } from './composables/useLocalAudio'
export { useWebSocketFft } from './composables/useWebSocketFft'
export type { WebSocketFftOptions, WebSocketFftReturn } from './composables/useWebSocketFft'

// Gradient helpers (re-exported from core for convenience)
export { gradientPresets, gradientNames, resolveGradientStops, buildGradientLUT } from 'fft-visualizer-core'
export type { GradientStop, GradientName, GradientInput } from 'fft-visualizer-core'
