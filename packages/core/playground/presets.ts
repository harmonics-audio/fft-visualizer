import type { GradientName } from '../src'

// Snapshot of every visualizer control the playground exposes (data-source
// settings like mode/wsUrl are deliberately not part of a preset).
export interface FftPresetSettings {
  bands: 10 | 20 | 40 | 80
  showPeaks: boolean
  peakDecay: number
  ledBars: boolean
  ledShape: 'segment' | 'meter'
  lumiBars: boolean
  radial: boolean
  radialInnerRadius: number
  barSpace: number
  reflexRatio: number
  reflexAlpha: number
  glow: number
  rotation: 0 | 90 | 180 | 270
  gradient: GradientName
  gradientDirection: 'vertical' | 'horizontal'
  colorMode: 'gradient' | 'bar-level'
  noiseFloor: number
  smoothing: number
  stereo: boolean
}

export interface FftPreset {
  name: string
  settings: FftPresetSettings
}

const base: FftPresetSettings = {
  bands: 80,
  showPeaks: false,
  peakDecay: 0.99,
  ledBars: false,
  ledShape: 'segment',
  lumiBars: false,
  radial: false,
  radialInnerRadius: 0.35,
  barSpace: 0.35,
  reflexRatio: 0,
  reflexAlpha: 0.5,
  glow: 0,
  rotation: 0,
  gradient: 'rainbow',
  gradientDirection: 'horizontal',
  colorMode: 'gradient',
  noiseFloor: 0,
  smoothing: 0.6,
  stereo: false
}

export const builtinPresets: FftPreset[] = [
  { name: 'stereo glow', settings: { ...base, barSpace: 0.4, reflexRatio: 0.35, glow: 1, noiseFloor: 65, smoothing: 0.65, stereo: true } },
  { name: 'reflected', settings: { ...base, peakDecay: 0.988, barSpace: 0.45, reflexRatio: 0.35, reflexAlpha: 0.25, glow: 0.1, noiseFloor: 50, smoothing: 0.7 } },
  { name: 'disco', settings: { ...base, radial: true, barSpace: 0.2, reflexRatio: 0.65, glow: 0.9, noiseFloor: 55, smoothing: 0.65 } },
  { name: 'lazers', settings: { ...base, bands: 40, radial: true, radialInnerRadius: 0, glow: 1, noiseFloor: 70, smoothing: 0.5, stereo: true } },
  { name: 'fireplace', settings: { ...base, glow: 1, noiseFloor: 75, smoothing: 0.9 } },
  { name: 'stereo peaks', settings: { ...base, showPeaks: true, peakDecay: 0.98, glow: 0.25, noiseFloor: 0, smoothing: 0.4, stereo: true } }
]
