import { describe, it, expect } from 'vitest'
import {
  aggregateBins,
  aggregatePeaks,
  peakToUint8,
  applyNoiseFloor,
  applySmoothing,
  updatePeaks
} from './processing'

describe('aggregateBins', () => {
  it('returns the source unchanged when target >= length', () => {
    const src = new Uint8Array([1, 2, 3])
    expect(aggregateBins(src, 3)).toBe(src)
    expect(aggregateBins(src, 5)).toBe(src)
  })

  it('max-pools groups when downsampling', () => {
    // 8 bins -> 4 bands, groups of 2, take the max of each pair
    const src = new Uint8Array([1, 9, 3, 2, 8, 4, 0, 7])
    expect(Array.from(aggregateBins(src, 4))).toEqual([9, 3, 8, 7])
  })

  it('handles a 4:1 ratio', () => {
    const src = new Uint8Array([10, 20, 30, 40, 5, 6, 7, 8])
    expect(Array.from(aggregateBins(src, 2))).toEqual([40, 8])
  })
})

describe('aggregatePeaks', () => {
  it('max-pools float peaks', () => {
    const src = new Float32Array([0.1, 0.9, 0.3, 0.2])
    expect(Array.from(aggregatePeaks(src, 2))).toEqual([
      expect.closeTo(0.9), expect.closeTo(0.3)
    ])
  })

  it('returns source unchanged when target >= length', () => {
    const src = new Float32Array([0.5])
    expect(aggregatePeaks(src, 4)).toBe(src)
  })
})

describe('peakToUint8', () => {
  it('scales 0-1 floats to 0-255 bytes', () => {
    const peaks = new Float32Array([0, 0.5, 1])
    expect(Array.from(peakToUint8(peaks, 3))).toEqual([0, 127, 255])
  })

  it('clamps values above 1 to 255', () => {
    const peaks = new Float32Array([2, 1.001])
    expect(Array.from(peakToUint8(peaks, 2))).toEqual([255, 255])
  })
})

describe('applyNoiseFloor', () => {
  it('is a no-op when threshold <= 0', () => {
    const data = new Uint8Array([0, 128, 255])
    applyNoiseFloor(data, 0)
    expect(Array.from(data)).toEqual([0, 128, 255])
  })

  it('cuts below the threshold and rescales the remainder to full range', () => {
    const data = new Uint8Array([50, 100, 255])
    applyNoiseFloor(data, 50)
    // below/at floor -> 0; 255 stays 255; 100 -> (100-50)*255/205 = 62
    expect(data[0]).toBe(0)
    expect(data[2]).toBe(255)
    expect(data[1]).toBe(Math.floor((100 - 50) * (255 / 205)))
  })
})

describe('applySmoothing', () => {
  it('is a no-op when factor <= 0', () => {
    const data = new Uint8Array([200])
    const state = new Float32Array([0])
    applySmoothing(data, state, 0)
    expect(data[0]).toBe(200)
    expect(state[0]).toBe(0)
  })

  it('moves the state toward the new value and writes it back', () => {
    const data = new Uint8Array([100])
    const state = new Float32Array([0])
    applySmoothing(data, state, 0.5)
    // state = 0.5*0 + 0.5*100 = 50
    expect(state[0]).toBeCloseTo(50)
    expect(data[0]).toBe(50)
  })

  it('converges toward a held input over repeated calls', () => {
    const state = new Float32Array([0])
    let last = 0
    for (let i = 0; i < 20; i++) {
      const data = new Uint8Array([100])
      applySmoothing(data, state, 0.7)
      last = data[0]!
    }
    expect(last).toBeGreaterThan(90)
    expect(last).toBeLessThanOrEqual(100)
  })
})

describe('updatePeaks', () => {
  it('raises the peak instantly when the new level is higher', () => {
    const peaks = new Float32Array([0.2])
    updatePeaks(peaks, new Uint8Array([255]), 0.9)
    expect(peaks[0]).toBeCloseTo(1)
  })

  it('decays the peak when the new level is lower', () => {
    const peaks = new Float32Array([1])
    updatePeaks(peaks, new Uint8Array([0]), 0.9)
    expect(peaks[0]).toBeCloseTo(0.9)
  })
})
