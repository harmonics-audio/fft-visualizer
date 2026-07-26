import type { GradientName } from '@fft-visualizer/core'

// Snapshot of every visualizer control the playgrounds expose (data-source
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

// The base every preset below spreads — these mirror the component's own prop
// defaults, so a preset only has to list what it changes.
export const defaultSettings: FftPresetSettings = {
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

// What every playground boots with — a livelier first impression than the
// component defaults (fewer, wider bars with peaks and stereo on). Both the old
// core and Vue playgrounds already started here; kept separate from
// defaultSettings because that one is the preset base.
export const initialSettings: FftPresetSettings = {
  ...defaultSettings,
  bands: 40,
  showPeaks: true,
  peakDecay: 0.89,
  barSpace: 0.25,
  reflexAlpha: 0.25,
  smoothing: 0.5,
  stereo: true
}

// Each preset lists only what makes it distinctive; everything else comes from
// defaultSettings. Spelling out all 19 values per preset is what let the core
// and Vue copies of this file drift apart in the first place.
export const builtinPresets: FftPreset[] = [
  {
    name: 'stereo glow',
    settings: { ...defaultSettings, barSpace: 0.4, reflexRatio: 0.35, glow: 1, noiseFloor: 65, smoothing: 0.65, stereo: true }
  },
  {
    name: 'reflected',
    settings: { ...defaultSettings, peakDecay: 0.988, barSpace: 0.45, reflexRatio: 0.35, reflexAlpha: 0.25, glow: 0.1, noiseFloor: 50, smoothing: 0.7 }
  },
  {
    name: 'disco',
    settings: { ...defaultSettings, radial: true, barSpace: 0.2, reflexRatio: 0.65, glow: 0.9, noiseFloor: 55, smoothing: 0.65 }
  },
  {
    name: 'disco stereo',
    settings: { ...defaultSettings, radial: true, radialInnerRadius: 0.5, barSpace: 0.2, reflexRatio: 0.65, glow: 1, rotation: 180, gradient: 'mono', colorMode: 'bar-level', noiseFloor: 40, smoothing: 0.5, stereo: true }
  },
  {
    name: 'lazers',
    settings: { ...defaultSettings, bands: 40, radial: true, radialInnerRadius: 0, glow: 1, noiseFloor: 70, smoothing: 0.5, stereo: true }
  },
  {
    name: 'fireplace',
    settings: { ...defaultSettings, glow: 1, noiseFloor: 75, smoothing: 0.9 }
  },
  {
    name: 'stereo peaks',
    settings: { ...defaultSettings, showPeaks: true, peakDecay: 0.98, glow: 0.25, smoothing: 0.4, stereo: true }
  },
  {
    name: 'vertical glowing',
    settings: { ...defaultSettings, bands: 40, barSpace: 0.05, reflexRatio: 0.35, reflexAlpha: 0.25, glow: 1, rotation: 270, colorMode: 'bar-level', noiseFloor: 20, smoothing: 0.65, stereo: true }
  },
  {
    name: 'vertical lumi bars',
    settings: { ...defaultSettings, bands: 10, showPeaks: true, lumiBars: true, barSpace: 0.05, reflexRatio: 0.35, reflexAlpha: 0.25, glow: 1, rotation: 270, colorMode: 'bar-level', noiseFloor: 20, smoothing: 0.65, stereo: true }
  },
  {
    name: 'horizontal lumi bars',
    settings: { ...defaultSettings, bands: 40, showPeaks: true, lumiBars: true, barSpace: 0.05, reflexRatio: 0.35, reflexAlpha: 0.25, glow: 1, colorMode: 'bar-level', noiseFloor: 20, smoothing: 0.65, stereo: true }
  },
  {
    name: 'vertical peaks',
    settings: { ...defaultSettings, bands: 20, showPeaks: true, peakDecay: 0.991, barSpace: 0.25, reflexRatio: 0.35, reflexAlpha: 0.25, glow: 0.45, rotation: 270, noiseFloor: 15, smoothing: 0.65, stereo: true }
  }
]
