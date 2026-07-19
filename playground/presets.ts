import type { GradientName } from '../src'

// Snapshot of every visualizer control the playground exposes (data-source
// settings like mode/wsUrl are deliberately not part of a preset).
export interface FftPresetSettings {
  bands: 10 | 20 | 40 | 80
  showPeaks: boolean
  peakDecay: number
  ledBars: boolean
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

export const builtinPresets: FftPreset[] = [
  {
    name: 'stereo glow',
    settings: {
      bands: 80,
      showPeaks: false,
      peakDecay: 0.99,
      ledBars: false,
      lumiBars: false,
      radial: false,
      radialInnerRadius: 0.35,
      barSpace: 0.4,
      reflexRatio: 0.35,
      reflexAlpha: 0.5,
      glow: 1,
      rotation: 0,
      gradient: 'rainbow',
      gradientDirection: 'horizontal',
      colorMode: 'gradient',
      noiseFloor: 65,
      smoothing: 0.65,
      stereo: true
    }
  },
  {
    name: 'reflected',
    settings: {
      bands: 80,
      showPeaks: false,
      peakDecay: 0.988,
      ledBars: false,
      lumiBars: false,
      radial: false,
      radialInnerRadius: 0.35,
      barSpace: 0.45,
      reflexRatio: 0.35,
      reflexAlpha: 0.25,
      glow: 0.1,
      rotation: 0,
      gradient: 'rainbow',
      gradientDirection: 'horizontal',
      colorMode: 'gradient',
      noiseFloor: 50,
      smoothing: 0.7,
      stereo: false
    }
  },
  {
    name: 'disco',
    settings: {
      bands: 80,
      showPeaks: false,
      peakDecay: 0.99,
      ledBars: false,
      lumiBars: false,
      radial: true,
      radialInnerRadius: 0.35,
      barSpace: 0.2,
      reflexRatio: 0.65,
      reflexAlpha: 0.5,
      glow: 0.9,
      rotation: 0,
      gradient: 'rainbow',
      gradientDirection: 'horizontal',
      colorMode: 'gradient',
      noiseFloor: 55,
      smoothing: 0.65,
      stereo: false
    }
  },
  {
    name: 'disco stereo',
    settings: {
      bands: 80,
      showPeaks: false,
      peakDecay: 0.99,
      ledBars: false,
      lumiBars: false,
      radial: true,
      radialInnerRadius: 0.5,
      barSpace: 0.2,
      reflexRatio: 0.65,
      reflexAlpha: 0.5,
      glow: 1,
      rotation: 180,
      gradient: 'mono',
      gradientDirection: 'horizontal',
      colorMode: 'bar-level',
      noiseFloor: 40,
      smoothing: 0.5,
      stereo: true
    }
  },
  {
    name: 'lazers',
    settings: {
      bands: 40,
      showPeaks: false,
      peakDecay: 0.99,
      ledBars: false,
      lumiBars: false,
      radial: true,
      radialInnerRadius: 0,
      barSpace: 0.35,
      reflexRatio: 0,
      reflexAlpha: 0.5,
      glow: 1,
      rotation: 0,
      gradient: 'rainbow',
      gradientDirection: 'horizontal',
      colorMode: 'gradient',
      noiseFloor: 70,
      smoothing: 0.5,
      stereo: true
    }
  },
  {
    name: 'fireplace',
    settings: {
      bands: 80,
      showPeaks: false,
      peakDecay: 0.99,
      ledBars: false,
      lumiBars: false,
      radial: false,
      radialInnerRadius: 0,
      barSpace: 0.35,
      reflexRatio: 0,
      reflexAlpha: 0.5,
      glow: 1,
      rotation: 0,
      gradient: 'rainbow',
      gradientDirection: 'horizontal',
      colorMode: 'gradient',
      noiseFloor: 75,
      smoothing: 0.5,
      stereo: false
    }
  },
  {
    name: 'stereo peaks',
    settings: {
      bands: 80,
      showPeaks: true,
      peakDecay: 0.98,
      ledBars: false,
      lumiBars: false,
      radial: false,
      radialInnerRadius: 0,
      barSpace: 0.35,
      reflexRatio: 0,
      reflexAlpha: 0.5,
      glow: 0.25,
      rotation: 0,
      gradient: 'rainbow',
      gradientDirection: 'horizontal',
      colorMode: 'gradient',
      noiseFloor: 0,
      smoothing: 0.4,
      stereo: true
    }
  },
  {
    name: 'vertical glowing',
    settings: {
      bands: 40,
      showPeaks: false,
      peakDecay: 0.99,
      ledBars: false,
      lumiBars: false,
      radial: false,
      radialInnerRadius: 0.35,
      barSpace: 0.05,
      reflexRatio: 0.35,
      reflexAlpha: 0.25,
      glow: 1,
      rotation: 270,
      gradient: 'rainbow',
      gradientDirection: 'horizontal',
      colorMode: 'bar-level',
      noiseFloor: 20,
      smoothing: 0.65,
      stereo: true
    }
  },
  {
    name: 'vertical lumi bars',
    settings: {
      bands: 10,
      showPeaks: true,
      peakDecay: 0.99,
      ledBars: false,
      lumiBars: true,
      radial: false,
      radialInnerRadius: 0.35,
      barSpace: 0.05,
      reflexRatio: 0.35,
      reflexAlpha: 0.25,
      glow: 1,
      rotation: 270,
      gradient: 'rainbow',
      gradientDirection: 'horizontal',
      colorMode: 'bar-level',
      noiseFloor: 20,
      smoothing: 0.65,
      stereo: true
    }
  },
  {
    name: 'horizontal lumi bars',
    settings: {
      bands: 40,
      showPeaks: true,
      peakDecay: 0.99,
      ledBars: false,
      lumiBars: true,
      radial: false,
      radialInnerRadius: 0.35,
      barSpace: 0.05,
      reflexRatio: 0.35,
      reflexAlpha: 0.25,
      glow: 1,
      rotation: 0,
      gradient: 'rainbow',
      gradientDirection: 'horizontal',
      colorMode: 'bar-level',
      noiseFloor: 20,
      smoothing: 0.65,
      stereo: true
    }
  },
  {
    name: 'vertical peaks',
    settings: {
      bands: 20,
      showPeaks: true,
      peakDecay: 0.991,
      ledBars: false,
      lumiBars: false,
      radial: false,
      radialInnerRadius: 0.35,
      barSpace: 0.25,
      reflexRatio: 0.35,
      reflexAlpha: 0.25,
      glow: 0.45,
      rotation: 270,
      gradient: 'rainbow',
      gradientDirection: 'horizontal',
      colorMode: 'gradient',
      noiseFloor: 15,
      smoothing: 0.65,
      stereo: true
    }
  }
]
