use realfft::RealFftPlanner;
use wasm_bindgen::prelude::*;

/// FFT processor for browser-based audio visualization.
///
/// Ported from backend-examples/rust/src/main.rs.
/// Takes time-domain audio samples and returns frequency magnitude spectrum
/// as u8 values (0-255) suitable for visualization.
#[wasm_bindgen]
pub struct FftProcessor {
    fft_size: usize,
    bins: usize,
    window: Vec<f32>,
    band_edges: Vec<(f32, f32)>,
    a_weights: Vec<f32>,
    sample_rate: f32,
    // realfft planner + cached plan
    fft: std::sync::Arc<dyn realfft::RealToComplex<f32>>,
}

#[wasm_bindgen]
impl FftProcessor {
    /// Create a new FFT processor.
    ///
    /// - `fft_size`: FFT window size (e.g., 1024 or 2048)
    /// - `bins`: Number of output frequency bands (e.g., 80)
    /// - `start_freq`: Lowest frequency in Hz (e.g., 100.0)
    /// - `end_freq`: Highest frequency in Hz (e.g., 18000.0)
    /// - `sample_rate`: Audio sample rate in Hz (e.g., 48000.0)
    #[wasm_bindgen(constructor)]
    pub fn new(
        fft_size: usize,
        bins: usize,
        start_freq: f32,
        end_freq: f32,
        sample_rate: f32,
    ) -> Self {
        let mut planner = RealFftPlanner::<f32>::new();
        let fft = planner.plan_fft_forward(fft_size);

        // Hann window
        let window: Vec<f32> = (0..fft_size)
            .map(|i| {
                0.5 * (1.0
                    - (2.0 * std::f32::consts::PI * i as f32 / (fft_size - 1) as f32).cos())
            })
            .collect();

        // Exponential frequency band edges
        let n = (end_freq / start_freq).log2() / bins as f32;
        let mut band_edges = Vec::with_capacity(bins);
        let mut freq = start_freq;
        for _ in 0..bins {
            let freq_lo = freq;
            freq *= 2.0_f32.powf(n);
            band_edges.push((freq_lo, freq));
        }

        // A-weighting coefficients
        let c1 = 12194.217_f32.powi(2);
        let c2 = 20.598997_f32.powi(2);
        let c3 = 107.65265_f32.powi(2);
        let c4 = 737.86223_f32.powi(2);

        let mut a_weights = Vec::with_capacity(bins);
        let mut freq = start_freq;
        for _ in 0..bins {
            let center_freq = freq * 2.0_f32.powf(n / 2.0);
            let f2 = center_freq.powi(2);
            let numerator = c1 * f2.powi(2);
            let denominator = (f2 + c2) * ((f2 + c3) * (f2 + c4)).sqrt() * (f2 + c1);
            let weight = if denominator > 0.0 {
                1.2589 * numerator / denominator
            } else {
                0.0
            };
            a_weights.push(weight);
            freq *= 2.0_f32.powf(n);
        }

        Self {
            fft_size,
            bins,
            window,
            band_edges,
            a_weights,
            sample_rate,
            fft,
        }
    }

    /// Process time-domain audio samples and return frequency magnitudes as 0-255 bytes.
    ///
    /// Input: f32 samples (length must be >= fft_size, only first fft_size samples are used).
    /// Output: Vec<u8> of length `bins`, each value 0-255 representing magnitude.
    pub fn process(&mut self, samples: &[f32]) -> Vec<u8> {
        let len = samples.len().min(self.fft_size);

        // Apply Hann window to input samples
        let mut input: Vec<f32> = samples[..len]
            .iter()
            .zip(self.window[..len].iter())
            .map(|(s, w)| s * w)
            .collect();

        // Zero-pad if input is shorter than fft_size
        input.resize(self.fft_size, 0.0);

        // Allocate output buffer for complex spectrum
        let mut spectrum = self.fft.make_output_vec();

        // Compute forward real FFT
        self.fft
            .process(&mut input, &mut spectrum)
            .unwrap_or_default();

        // Convert to magnitude (normalized by fft_size)
        let magnitude: Vec<f32> = spectrum
            .iter()
            .map(|c| c.norm() / self.fft_size as f32)
            .collect();

        // Map to frequency bands with A-weighting
        let bin_width = self.sample_rate / self.fft_size as f32;
        let mut result = vec![0u8; self.bins];

        for (i, (freq_lo, freq_hi)) in self.band_edges.iter().enumerate() {
            // Interpolated values at band edges
            let val_lo = self.interpolate(&magnitude, *freq_lo, bin_width);
            let val_hi = self.interpolate(&magnitude, *freq_hi, bin_width);
            let mut band_mag = val_lo.max(val_hi);

            // Max of all FFT bins within this frequency band
            let bin_lo = (freq_lo / bin_width) as usize + 1;
            let bin_hi = (freq_hi / bin_width) as usize;
            if bin_hi >= bin_lo && bin_lo < magnitude.len() {
                let bin_hi = bin_hi.min(magnitude.len() - 1);
                for j in bin_lo..=bin_hi {
                    band_mag = band_mag.max(magnitude[j]);
                }
            }

            // Apply A-weighting
            let weighted = band_mag * self.a_weights[i];

            // Convert to dB and normalize to 0-255
            let db = 20.0 * (weighted + 1e-10).log10();
            let min_db = -85.0_f32;
            let max_db = -10.0_f32;
            let normalized = (db - min_db) / (max_db - min_db);
            result[i] = (normalized.clamp(0.0, 1.0) * 255.0) as u8;
        }

        result
    }

    /// Get the required input buffer size (fft_size).
    pub fn input_size(&self) -> usize {
        self.fft_size
    }

    /// Get the number of output bins.
    pub fn output_bins(&self) -> usize {
        self.bins
    }
}

impl FftProcessor {
    /// Linear interpolation of magnitude at a given frequency.
    fn interpolate(&self, magnitude: &[f32], freq: f32, bin_width: f32) -> f32 {
        let bin_pos = freq / bin_width;
        let bin_lo = bin_pos as usize;
        let bin_hi = (bin_lo + 1).min(magnitude.len() - 1);
        let ratio = bin_pos - bin_lo as f32;
        let clamped_lo = bin_lo.min(magnitude.len() - 1);
        magnitude[clamped_lo] + (magnitude[bin_hi] - magnitude[clamped_lo]) * ratio
    }
}
