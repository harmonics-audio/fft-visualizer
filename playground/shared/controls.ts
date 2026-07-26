import { gradientNames } from '@fft-visualizer/core'
import type { FftPresetSettings } from './presets'

// One editable visualizer control. `visible` is a pure predicate over the
// current settings rather than a closure over any app's state, so the same
// descriptor works for plain DOM, Vue refs, React state and Nuxt SSR.
export type Control =
  | { kind: 'select', key: keyof FftPresetSettings, label: string, options: { value: string, label: string }[], numeric?: boolean, visible?: (s: FftPresetSettings) => boolean }
  | { kind: 'checkbox', key: keyof FftPresetSettings, label: string, visible?: (s: FftPresetSettings) => boolean }
  | { kind: 'range', key: keyof FftPresetSettings, label: string, min: number, max: number, step: number, digits?: number, visible?: (s: FftPresetSettings) => boolean }
  | { kind: 'rotate', key: 'rotation', label: string, visible?: (s: FftPresetSettings) => boolean }

export interface ControlSection {
  id: string
  label: string
  controls: Control[]
}

const gradientOptions = gradientNames.map(name => ({
  value: name,
  label: name[0]!.toUpperCase() + name.slice(1)
}))

// Grouped by what each control actually affects. Order here is render order.
export const controlSections: ControlSection[] = [
  {
    id: 'layout',
    label: 'Layout',
    controls: [
      { kind: 'select', key: 'bands', label: 'Bands', numeric: true, options: [10, 20, 40, 80].map(n => ({ value: String(n), label: String(n) })) },
      { kind: 'range', key: 'barSpace', label: 'Bar Space', min: 0, max: 0.9, step: 0.05, digits: 2 },
      { kind: 'checkbox', key: 'radial', label: 'Radial' },
      { kind: 'range', key: 'radialInnerRadius', label: 'Inner Radius', min: 0, max: 0.9, step: 0.05, digits: 2, visible: s => s.radial },
      { kind: 'rotate', key: 'rotation', label: 'Rotate' },
      { kind: 'checkbox', key: 'stereo', label: 'Stereo' }
    ]
  },
  {
    id: 'bar-style',
    label: 'Bar style',
    controls: [
      { kind: 'checkbox', key: 'ledBars', label: 'LED Bars' },
      { kind: 'select', key: 'ledShape', label: 'LED Shape', visible: s => s.ledBars, options: [{ value: 'segment', label: 'Segment' }, { value: 'meter', label: 'Meter' }] },
      { kind: 'checkbox', key: 'lumiBars', label: 'Lumi Bars' },
      { kind: 'range', key: 'glow', label: 'Glow', min: 0, max: 1, step: 0.05, digits: 2 }
    ]
  },
  {
    id: 'peaks',
    label: 'Peaks',
    controls: [
      { kind: 'checkbox', key: 'showPeaks', label: 'Show Peaks' },
      { kind: 'range', key: 'peakDecay', label: 'Peak Drop', min: 0.8, max: 0.999, step: 0.001, digits: 3 }
    ]
  },
  {
    id: 'reflection',
    label: 'Reflection',
    controls: [
      { kind: 'range', key: 'reflexRatio', label: 'Reflex', min: 0, max: 0.7, step: 0.05, digits: 2, visible: s => s.radial || !s.stereo },
      { kind: 'range', key: 'reflexAlpha', label: 'Reflex Alpha', min: 0, max: 1, step: 0.05, digits: 2, visible: s => (s.radial || !s.stereo) && s.reflexRatio > 0 }
    ]
  },
  {
    id: 'color',
    label: 'Color',
    controls: [
      { kind: 'select', key: 'gradient', label: 'Gradient', options: gradientOptions },
      { kind: 'select', key: 'gradientDirection', label: 'Direction', options: [{ value: 'vertical', label: 'Vertical' }, { value: 'horizontal', label: 'Horizontal' }] },
      { kind: 'select', key: 'colorMode', label: 'Color Mode', options: [{ value: 'gradient', label: 'Gradient' }, { value: 'bar-level', label: 'Bar Level' }] }
    ]
  },
  {
    id: 'signal',
    label: 'Signal',
    controls: [
      { kind: 'range', key: 'noiseFloor', label: 'Noise Floor', min: 0, max: 100, step: 1 },
      { kind: 'range', key: 'smoothing', label: 'Smoothing', min: 0, max: 0.95, step: 0.05, digits: 2 }
    ]
  }
]

// Applies the `visible` predicates and drops sections left with nothing to
// show — Reflection disappears entirely in the default stereo, non-radial
// state. Lives here so all four playgrounds can't disagree about it.
export function visibleSections(settings: FftPresetSettings): ControlSection[] {
  return controlSections
    .map(section => ({
      ...section,
      controls: section.controls.filter(control => control.visible?.(settings) ?? true)
    }))
    .filter(section => section.controls.length > 0)
}

// Range labels read "Smoothing: 0.65"; digits is per-control because peakDecay
// needs three decimals to be adjustable at all.
export function formatValue(control: Control, settings: FftPresetSettings): string {
  const value = settings[control.key]
  return control.kind === 'range' && control.digits != null
    ? (value as number).toFixed(control.digits)
    : String(value)
}
