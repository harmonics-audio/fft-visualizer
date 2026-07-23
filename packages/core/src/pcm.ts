/**
 * PCM decoding helpers.
 *
 * Converts interleaved integer PCM (16/24/32-bit) into normalized Float32
 * channels (mono mix + left + right), suitable for feeding an FFT.
 */

export interface PcmChannels {
  /** Mono mix: (left + right) / 2 */
  mono: Float32Array
  /** Left channel, normalized to [-1, 1) */
  left: Float32Array
  /** Right channel (equals left for mono input), normalized to [-1, 1) */
  right: Float32Array
}

/**
 * Decode an interleaved PCM buffer into normalized channels.
 *
 * - `bitDepth`: 16, 24 or 32. Any other value yields empty channels.
 * - `channels`: interleaved channel count (1 = mono, 2 = stereo, …). Only the
 *   first two channels are used; mono input is duplicated to left and right.
 */
export function pcmToChannels(buffer: ArrayBuffer, bitDepth: number, channels: number): PcmChannels {
  let mono: Float32Array
  let left: Float32Array
  let right: Float32Array

  if (bitDepth === 16) {
    const int16 = new Int16Array(buffer)
    const frameCount = Math.floor(int16.length / channels)
    mono = new Float32Array(frameCount)
    left = new Float32Array(frameCount)
    right = new Float32Array(frameCount)
    for (let i = 0; i < frameCount; i++) {
      const l = int16[i * channels]! / 32768
      const r = channels > 1 ? int16[i * channels + 1]! / 32768 : l
      left[i] = l
      right[i] = r
      mono[i] = (l + r) / 2
    }
  } else if (bitDepth === 24) {
    const bytes = new Uint8Array(buffer)
    const bytesPerSample = 3
    const frameCount = Math.floor(bytes.length / (bytesPerSample * channels))
    mono = new Float32Array(frameCount)
    left = new Float32Array(frameCount)
    right = new Float32Array(frameCount)
    for (let i = 0; i < frameCount; i++) {
      // Left channel
      const lOffset = (i * channels) * bytesPerSample
      let lSample = bytes[lOffset]! | (bytes[lOffset + 1]! << 8) | (bytes[lOffset + 2]! << 16)
      if (lSample & 0x800000) lSample |= 0xFF000000
      const l = lSample / 8388608

      // Right channel
      let r: number
      if (channels > 1) {
        const rOffset = (i * channels + 1) * bytesPerSample
        let rSample = bytes[rOffset]! | (bytes[rOffset + 1]! << 8) | (bytes[rOffset + 2]! << 16)
        if (rSample & 0x800000) rSample |= 0xFF000000
        r = rSample / 8388608
      } else {
        r = l
      }

      left[i] = l
      right[i] = r
      mono[i] = (l + r) / 2
    }
  } else if (bitDepth === 32) {
    const int32 = new Int32Array(buffer)
    const frameCount = Math.floor(int32.length / channels)
    mono = new Float32Array(frameCount)
    left = new Float32Array(frameCount)
    right = new Float32Array(frameCount)
    for (let i = 0; i < frameCount; i++) {
      const l = int32[i * channels]! / 2147483648
      const r = channels > 1 ? int32[i * channels + 1]! / 2147483648 : l
      left[i] = l
      right[i] = r
      mono[i] = (l + r) / 2
    }
  } else {
    const empty = new Float32Array(0)
    return { mono: empty, left: empty, right: empty }
  }

  return { mono, left, right }
}
