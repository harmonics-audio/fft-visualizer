import FFTVisualizer from './components/FFTVisualizer.vue'

export { FFTVisualizer }
export { useLocalAudio } from './composables/useLocalAudio'
export type { AudioDevice, AudioSourceType, LocalAudioOptions, LocalAudioReturn } from './composables/useLocalAudio'
export { useWebSocketFft } from './composables/useWebSocketFft'
export type { WebSocketFftOptions, WebSocketFftReturn } from './composables/useWebSocketFft'
export { gradientPresets, gradientNames, resolveGradientStops, buildGradientLUT } from './gradients'
export type { GradientStop, GradientName, GradientInput } from './gradients'
