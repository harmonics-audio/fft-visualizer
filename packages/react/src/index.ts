import FFTVisualizer from './components/FFTVisualizer'

export { FFTVisualizer }
export type { FFTVisualizerProps, FFTVisualizerHandle } from './components/FFTVisualizer'

// Gradient helpers (re-exported from core for convenience)
export { gradientPresets, gradientNames, resolveGradientStops, buildGradientLUT } from '@fft-visualizer/core'
export type { GradientStop, GradientName, GradientInput } from '@fft-visualizer/core'

// The option/event types the component's props are built from
export type { FFTVisualizerOptions, VisualizerMode, BandCount, AudioDevice } from '@fft-visualizer/core'
