import { describe, it, expect } from 'vitest'
import { pcmToChannels } from './pcm'

describe('pcmToChannels — 16-bit', () => {
  it('decodes interleaved stereo and mixes mono', () => {
    const int16 = new Int16Array([16384, -16384, 32767, 0])
    const { mono, left, right } = pcmToChannels(int16.buffer, 16, 2)
    expect(left[0]).toBeCloseTo(0.5)
    expect(right[0]).toBeCloseTo(-0.5)
    expect(mono[0]).toBeCloseTo(0)
    expect(left[1]).toBeCloseTo(32767 / 32768)
    expect(right[1]).toBeCloseTo(0)
    expect(mono[1]).toBeCloseTo((32767 / 32768) / 2)
  })

  it('duplicates mono input to both channels', () => {
    const int16 = new Int16Array([16384, -32768])
    const { mono, left, right } = pcmToChannels(int16.buffer, 16, 1)
    expect(left[0]).toBeCloseTo(0.5)
    expect(right[0]).toBeCloseTo(0.5)
    expect(mono[0]).toBeCloseTo(0.5)
    expect(left[1]).toBeCloseTo(-1)
    expect(right[1]).toBeCloseTo(-1)
  })
})

describe('pcmToChannels — 24-bit', () => {
  // Little-endian 3-byte samples
  const bytes = new Uint8Array([
    0x00, 0x00, 0x40, // +0.5  (0x400000 = 4194304)
    0x00, 0x00, 0xC0  // -0.5  (0xC00000 sign-extended = -4194304)
  ])

  it('decodes positive and sign-extended negative mono samples', () => {
    const { mono, left, right } = pcmToChannels(bytes.buffer, 24, 1)
    expect(left[0]).toBeCloseTo(0.5, 5)
    expect(left[1]).toBeCloseTo(-0.5, 5)
    expect(right[1]).toBeCloseTo(-0.5, 5)
    expect(mono[1]).toBeCloseTo(-0.5, 5)
  })

  it('decodes interleaved stereo', () => {
    // one frame: L = +0.5, R = -0.5
    const { mono, left, right } = pcmToChannels(bytes.buffer, 24, 2)
    expect(left[0]).toBeCloseTo(0.5, 5)
    expect(right[0]).toBeCloseTo(-0.5, 5)
    expect(mono[0]).toBeCloseTo(0, 5)
  })
})

describe('pcmToChannels — 32-bit', () => {
  it('decodes interleaved stereo', () => {
    const int32 = new Int32Array([1073741824, -1073741824])
    const { mono, left, right } = pcmToChannels(int32.buffer, 32, 2)
    expect(left[0]).toBeCloseTo(0.5)
    expect(right[0]).toBeCloseTo(-0.5)
    expect(mono[0]).toBeCloseTo(0)
  })
})

describe('pcmToChannels — unknown bit depth', () => {
  it('returns empty channels', () => {
    const { mono, left, right } = pcmToChannels(new ArrayBuffer(8), 8, 2)
    expect(mono.length).toBe(0)
    expect(left.length).toBe(0)
    expect(right.length).toBe(0)
  })
})
