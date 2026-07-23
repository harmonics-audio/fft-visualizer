/**
 * Gradient presets and lookup-table (LUT) generation.
 *
 * The shader samples bar colors from a 256x1 RGBA texture instead of
 * hardcoded GLSL branches, so any CSS-color gradient works — presets
 * below or custom stops passed via the `gradient` prop.
 */

export interface GradientStop {
  /** Position along the gradient, 0 (bottom/left) to 1 (top/right) */
  stop: number
  /** Any CSS color (hex, rgb(), hsl(), named) */
  color: string
}

/**
 * Built-in gradient presets.
 *
 * `classic`, `rainbow` and `blue` reproduce the exact colors of the
 * pre-0.2.0 hardcoded shader gradients, so existing setups look identical.
 */
export const gradientPresets = {
  // Red -> orange -> yellow (original default)
  classic: [
    { stop: 0, color: '#c21400' },
    { stop: 0.6, color: '#ff8c00' },
    { stop: 1, color: '#ffc400' }
  ],
  // Soft 12-color prism rainbow (original "rainbow")
  rainbow: [
    { stop: 0 / 11, color: '#881177' },
    { stop: 1 / 11, color: '#aa3355' },
    { stop: 2 / 11, color: '#cc6666' },
    { stop: 3 / 11, color: '#ee9944' },
    { stop: 4 / 11, color: '#eedd00' },
    { stop: 5 / 11, color: '#99dd55' },
    { stop: 6 / 11, color: '#44dd88' },
    { stop: 7 / 11, color: '#22ccbb' },
    { stop: 8 / 11, color: '#00bbcc' },
    { stop: 9 / 11, color: '#0099cc' },
    { stop: 10 / 11, color: '#3366bb' },
    { stop: 1, color: '#663399' }
  ],
  // Dark blue -> cyan -> white (original "blue")
  blue: [
    { stop: 0, color: '#001a66' },
    { stop: 0.6, color: '#00ccff' },
    { stop: 1, color: '#ffffff' }
  ],
  // Vivid spectral colors
  prism: [
    { stop: 0, color: '#ff0000' },
    { stop: 0.25, color: '#ffff00' },
    { stop: 0.5, color: '#00ff00' },
    { stop: 0.75, color: '#00ffff' },
    { stop: 1, color: '#4040ff' }
  ],
  // Deep red -> orangered -> gold
  orangered: [
    { stop: 0, color: '#3d0000' },
    { stop: 0.6, color: '#ff4500' },
    { stop: 1, color: '#ffd700' }
  ],
  // Near-black blue -> steel blue -> light steel
  steelblue: [
    { stop: 0, color: '#0c1a2e' },
    { stop: 0.6, color: '#4682b4' },
    { stop: 1, color: '#b0c4de' }
  ],
  // Indigo -> magenta -> orange -> warm yellow
  sunset: [
    { stop: 0, color: '#2d1b69' },
    { stop: 0.45, color: '#b83280' },
    { stop: 0.75, color: '#ff6b35' },
    { stop: 1, color: '#ffd166' }
  ],
  // Deep night blue -> teal -> mint -> violet
  aurora: [
    { stop: 0, color: '#001233' },
    { stop: 0.45, color: '#0f9b8e' },
    { stop: 0.7, color: '#5eead4' },
    { stop: 1, color: '#c084fc' }
  ],
  // Dark violet -> electric purple -> pink
  dusk: [
    { stop: 0, color: '#1e0533' },
    { stop: 0.6, color: '#7b2ff7' },
    { stop: 1, color: '#f72585' }
  ],
  // Dim gray -> white
  mono: [
    { stop: 0, color: '#404040' },
    { stop: 1, color: '#ffffff' }
  ]
} satisfies Record<string, GradientStop[]>

export type GradientName = keyof typeof gradientPresets

/** Names of all built-in presets, for building settings UIs */
export const gradientNames = Object.keys(gradientPresets) as GradientName[]

export type GradientInput = GradientName | GradientStop[]

/** Resolve a gradient prop value (preset name or custom stops) to stops */
export function resolveGradientStops(gradient: GradientInput | string | undefined): GradientStop[] {
  if (Array.isArray(gradient) && gradient.length > 0) {
    return [...gradient].sort((a, b) => a.stop - b.stop)
  }
  if (typeof gradient === 'string' && gradient in gradientPresets) {
    return gradientPresets[gradient as GradientName]
  }
  return gradientPresets.classic
}

/** LUT width in texels */
export const GRADIENT_LUT_SIZE = 256

/**
 * Rasterize gradient stops into a 256x1 RGBA Uint8Array via a 2D canvas,
 * so all CSS color formats and browser-native interpolation are supported.
 */
export function buildGradientLUT(stops: GradientStop[], size: number = GRADIENT_LUT_SIZE): Uint8Array {
  const fallback = () => {
    // Non-DOM environment: flat white LUT (component is client-only anyway)
    const lut = new Uint8Array(size * 4)
    lut.fill(255)
    return lut
  }

  if (typeof document === 'undefined') return fallback()

  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = 1
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return fallback()

  const grad = ctx.createLinearGradient(0, 0, size, 0)
  for (const { stop, color } of stops) {
    try {
      grad.addColorStop(Math.min(1, Math.max(0, stop)), color)
    } catch {
      console.warn(`[FFTVisualizer] Invalid gradient color: ${color}`)
    }
  }
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, size, 1)

  return new Uint8Array(ctx.getImageData(0, 0, size, 1).data)
}
