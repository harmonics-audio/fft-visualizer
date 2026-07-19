/**
 * Pure FFT display-data processing helpers.
 *
 * These are intentionally framework-agnostic and side-effect-light (they operate
 * on plain typed arrays) so they can be unit-tested and reused outside Vue.
 */

/**
 * Max-pool a spectrum down to `targetBands` bands. Each output band takes the
 * maximum of its source group. Returns the source unchanged if it already has
 * `targetBands` or fewer bins.
 */
export function aggregateBins(source: Uint8Array, targetBands: number): Uint8Array {
  if (targetBands >= source.length) return source

  const result = new Uint8Array(targetBands)
  const ratio = source.length / targetBands

  for (let i = 0; i < targetBands; i++) {
    const startBin = Math.floor(i * ratio)
    const endBin = Math.floor((i + 1) * ratio)
    let maxVal = 0
    for (let j = startBin; j < endBin; j++) {
      if (source[j]! > maxVal) maxVal = source[j]!
    }
    result[i] = maxVal
  }
  return result
}

/**
 * Max-pool peak levels (0–1 floats) down to `targetBands` bands. Same algorithm
 * as {@link aggregateBins} but for the Float32Array peak buffer.
 */
export function aggregatePeaks(source: Float32Array, targetBands: number): Float32Array {
  if (targetBands >= source.length) return source

  const result = new Float32Array(targetBands)
  const ratio = source.length / targetBands

  for (let i = 0; i < targetBands; i++) {
    const startBin = Math.floor(i * ratio)
    const endBin = Math.floor((i + 1) * ratio)
    let maxVal = 0
    for (let j = startBin; j < endBin; j++) {
      if (source[j]! > maxVal) maxVal = source[j]!
    }
    result[i] = maxVal
  }
  return result
}

/**
 * Convert normalized peak levels (0–1) into 0–255 bytes for texture upload.
 */
export function peakToUint8(peaks: Float32Array, numBins: number): Uint8Array {
  const result = new Uint8Array(numBins)
  for (let i = 0; i < numBins; i++) {
    result[i] = Math.min(255, Math.floor(peaks[i]! * 255))
  }
  return result
}

/**
 * Subtract a noise-floor `threshold` (0–255) from each magnitude and rescale the
 * remaining range back to 0–255, so quiet content is cut and loud content keeps
 * full contrast. Mutates `data` in place. No-op when `threshold <= 0`.
 */
export function applyNoiseFloor(data: Uint8Array, threshold: number): void {
  if (threshold <= 0) return

  for (let i = 0; i < data.length; i++) {
    data[i] = data[i]! > threshold ? data[i]! - threshold : 0
  }
  const scale = 255 / (255 - threshold)
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.min(255, Math.floor(data[i]! * scale))
  }
}

/**
 * Exponential temporal smoothing. `state` holds the running smoothed value per
 * bin and is updated in place; the floored result is written back into `data`.
 * `factor` is the smoothing amount (0 = none/instant, →1 = heavy/slow). No-op
 * when `factor <= 0`.
 */
export function applySmoothing(data: Uint8Array, state: Float32Array, factor: number): void {
  if (factor <= 0) return

  for (let i = 0; i < data.length; i++) {
    state[i] = factor * state[i]! + (1 - factor) * data[i]!
    data[i] = Math.floor(state[i]!)
  }
}

/**
 * Peak-hold with decay. For each bin, raise the peak instantly to the new level
 * (`data` normalized to 0–1), otherwise multiply the held peak by `decay`
 * (e.g. 0.997 = slow fall, 0.9 = fast). Mutates `peaks` in place.
 */
export function updatePeaks(peaks: Float32Array, data: Uint8Array, decay: number): void {
  for (let i = 0; i < data.length; i++) {
    const value = data[i]! / 255
    if (value > peaks[i]!) {
      peaks[i] = value
    } else {
      peaks[i]! *= decay
    }
  }
}
