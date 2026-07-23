/* tslint:disable */
/* eslint-disable */

/**
 * FFT processor for browser-based audio visualization.
 *
 * Ported from backend-examples/rust/src/main.rs.
 * Takes time-domain audio samples and returns frequency magnitude spectrum
 * as u8 values (0-255) suitable for visualization.
 */
export class FftProcessor {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Get the required input buffer size (fft_size).
     */
    input_size(): number;
    /**
     * Create a new FFT processor.
     *
     * - `fft_size`: FFT window size (e.g., 1024 or 2048)
     * - `bins`: Number of output frequency bands (e.g., 80)
     * - `start_freq`: Lowest frequency in Hz (e.g., 100.0)
     * - `end_freq`: Highest frequency in Hz (e.g., 18000.0)
     * - `sample_rate`: Audio sample rate in Hz (e.g., 48000.0)
     */
    constructor(fft_size: number, bins: number, start_freq: number, end_freq: number, sample_rate: number);
    /**
     * Get the number of output bins.
     */
    output_bins(): number;
    /**
     * Process time-domain audio samples and return frequency magnitudes as 0-255 bytes.
     *
     * Input: f32 samples (length must be >= fft_size, only first fft_size samples are used).
     * Output: Vec<u8> of length `bins`, each value 0-255 representing magnitude.
     */
    process(samples: Float32Array): Uint8Array;
}
