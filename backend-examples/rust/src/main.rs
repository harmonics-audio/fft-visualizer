//! FFT WebSocket Server - Rust Example
//!
//! Captures audio from system input, computes FFT, and streams frequency
//! data to WebSocket clients for visualization.
//!
//! Usage:
//!     cargo run -- [--port 3001]
//!
//! Protocol:
//!     1. Client connects to ws://host:port/
//!     2. Server sends config: {"type":"config","mode":"fft","bins":80,"fps":120}
//!     3. Server streams binary: 80 bytes of uint8 (frequency magnitudes 0-255)

use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use clap::Parser;
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use futures_util::{SinkExt, StreamExt};
use rustfft::{num_complex::Complex, FftPlanner};
use serde::Serialize;
use tokio::net::TcpListener;
use tokio::sync::broadcast;
use tokio_tungstenite::tungstenite::Message;

// Configuration
const SAMPLE_RATE: u32 = 48000;
const FFT_SIZE: usize = 1024;
const FFT_BINS: usize = 80;
const FFT_FPS: u32 = 120;
const FFT_START_FREQ: f32 = 100.0;
const FFT_END_FREQ: f32 = 18000.0;

#[derive(Parser, Debug)]
#[command(name = "fft-server")]
#[command(about = "FFT WebSocket server for @fft-visualizer/core")]
struct Args {
    #[arg(short, long, default_value_t = 3001)]
    port: u16,

    /// Audio input device name (substring match). Use --list-devices to see available devices.
    #[arg(short, long)]
    device: Option<String>,

    /// List available audio input devices and exit
    #[arg(long)]
    list_devices: bool,
}

#[derive(Serialize)]
struct Config {
    #[serde(rename = "type")]
    msg_type: String,
    mode: String,
    bins: usize,
    fps: u32,
}

struct FFTProcessor {
    buffer: Vec<f32>,
    buffer_pos: usize,
    window: Vec<f32>,
    fft: Arc<dyn rustfft::Fft<f32>>,
    band_edges: Vec<(f32, f32)>,
    a_weights: Vec<f32>,
    last_fft_time: Instant,
    fft_interval: Duration,
}

impl FFTProcessor {
    fn new() -> Self {
        let mut planner = FftPlanner::new();
        let fft = planner.plan_fft_forward(FFT_SIZE);

        // Create Hann window
        let window: Vec<f32> = (0..FFT_SIZE)
            .map(|i| 0.5 * (1.0 - (2.0 * std::f32::consts::PI * i as f32 / (FFT_SIZE - 1) as f32).cos()))
            .collect();

        // Compute band edges
        let n = (FFT_END_FREQ / FFT_START_FREQ).log2() / FFT_BINS as f32;
        let mut band_edges = Vec::with_capacity(FFT_BINS);
        let mut freq = FFT_START_FREQ;
        for _ in 0..FFT_BINS {
            let freq_lo = freq;
            freq *= 2.0_f32.powf(n);
            band_edges.push((freq_lo, freq));
        }

        // Compute A-weighting
        let c1 = 12194.217_f32.powi(2);
        let c2 = 20.598997_f32.powi(2);
        let c3 = 107.65265_f32.powi(2);
        let c4 = 737.86223_f32.powi(2);

        let mut a_weights = Vec::with_capacity(FFT_BINS);
        let mut freq = FFT_START_FREQ;
        for _ in 0..FFT_BINS {
            let center_freq = freq * 2.0_f32.powf(n / 2.0);
            let f2 = center_freq.powi(2);
            let numerator = c1 * f2.powi(2);
            let denominator = (f2 + c2) * ((f2 + c3) * (f2 + c4)).sqrt() * (f2 + c1);
            let weight = if denominator > 0.0 { 1.2589 * numerator / denominator } else { 0.0 };
            a_weights.push(weight);
            freq *= 2.0_f32.powf(n);
        }

        Self {
            buffer: vec![0.0; FFT_SIZE],
            buffer_pos: 0,
            window,
            fft,
            band_edges,
            a_weights,
            last_fft_time: Instant::now(),
            fft_interval: Duration::from_secs_f32(1.0 / FFT_FPS as f32),
        }
    }

    fn process(&mut self, samples: &[f32]) -> Option<Vec<u8>> {
        // Add samples to buffer
        for &sample in samples {
            if self.buffer_pos < FFT_SIZE {
                self.buffer[self.buffer_pos] = sample;
                self.buffer_pos += 1;
            }
        }

        // Check if we have enough samples and rate limiting
        if self.buffer_pos < FFT_SIZE {
            return None;
        }
        if self.last_fft_time.elapsed() < self.fft_interval {
            return None;
        }

        self.last_fft_time = Instant::now();
        self.buffer_pos = 0;

        // Apply window
        let mut complex: Vec<Complex<f32>> = self.buffer
            .iter()
            .zip(self.window.iter())
            .map(|(s, w)| Complex::new(s * w, 0.0))
            .collect();

        // Compute FFT
        self.fft.process(&mut complex);

        // Get magnitude
        let magnitude: Vec<f32> = complex[..=FFT_SIZE / 2]
            .iter()
            .map(|c| c.norm() / FFT_SIZE as f32)
            .collect();

        // Map to frequency bands
        let bin_width = SAMPLE_RATE as f32 / FFT_SIZE as f32;
        let mut spectrum = vec![0.0_f32; FFT_BINS];

        for (i, (freq_lo, freq_hi)) in self.band_edges.iter().enumerate() {
            let val_lo = self.interpolate(&magnitude, *freq_lo, bin_width);
            let val_hi = self.interpolate(&magnitude, *freq_hi, bin_width);
            let mut band_mag = val_lo.max(val_hi);

            let bin_lo = (freq_lo / bin_width) as usize + 1;
            let bin_hi = (freq_hi / bin_width) as usize;
            if bin_hi >= bin_lo && bin_lo < magnitude.len() {
                let bin_hi = bin_hi.min(magnitude.len() - 1);
                for j in bin_lo..=bin_hi {
                    band_mag = band_mag.max(magnitude[j]);
                }
            }

            spectrum[i] = band_mag * self.a_weights[i];
        }

        // Convert to dB and normalize
        let min_db = -85.0_f32;
        let max_db = -25.0_f32;

        let result: Vec<u8> = spectrum
            .iter()
            .map(|&v| {
                let db = 20.0 * (v + 1e-10).log10();
                let normalized = (db - min_db) / (max_db - min_db);
                (normalized.clamp(0.0, 1.0) * 255.0) as u8
            })
            .collect();

        Some(result)
    }

    fn interpolate(&self, magnitude: &[f32], freq: f32, bin_width: f32) -> f32 {
        let bin_pos = freq / bin_width;
        let bin_lo = bin_pos as usize;
        let bin_hi = (bin_lo + 1).min(magnitude.len() - 1);
        let ratio = bin_pos - bin_lo as f32;
        let clamped_lo = bin_lo.min(magnitude.len() - 1);
        magnitude[clamped_lo] + (magnitude[bin_hi] - magnitude[clamped_lo]) * ratio
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args = Args::parse();

    // Create broadcast channel for FFT data
    let (tx, _) = broadcast::channel::<Vec<u8>>(16);
    let tx_clone = tx.clone();

    // Start audio capture in a separate thread
    let processor = Arc::new(Mutex::new(FFTProcessor::new()));
    let processor_clone = processor.clone();

    std::thread::spawn(move || {
        let host = cpal::default_host();

        println!("Available input devices:");
        for device in host.input_devices().unwrap() {
            if let Ok(name) = device.name() {
                println!("  - {}", name);
            }
        }

        let device = host.default_input_device().expect("No input device available");
        println!("Using: {}", device.name().unwrap_or_default());

        let config = cpal::StreamConfig {
            channels: 1,
            sample_rate: cpal::SampleRate(SAMPLE_RATE),
            buffer_size: cpal::BufferSize::Fixed(256),
        };

        let stream = device
            .build_input_stream(
                &config,
                move |data: &[f32], _: &cpal::InputCallbackInfo| {
                    if let Ok(mut proc) = processor_clone.lock() {
                        if let Some(fft_data) = proc.process(data) {
                            let _ = tx_clone.send(fft_data);
                        }
                    }
                },
                |err| eprintln!("Audio error: {}", err),
                None,
            )
            .expect("Failed to build input stream");

        stream.play().expect("Failed to start audio stream");
        println!("Audio capture started");

        // Keep thread alive
        loop {
            std::thread::sleep(Duration::from_secs(1));
        }
    });

    // Start WebSocket server
    let addr = format!("0.0.0.0:{}", args.port);
    let listener = TcpListener::bind(&addr).await?;
    println!("FFT server started on ws://{}", addr);

    while let Ok((stream, addr)) = listener.accept().await {
        let mut rx = tx.subscribe();

        tokio::spawn(async move {
            let ws_stream = tokio_tungstenite::accept_async(stream)
                .await
                .expect("WebSocket handshake failed");

            let (mut write, mut read) = ws_stream.split();
            println!("Client connected: {}", addr);

            // Send config
            let config = Config {
                msg_type: "config".to_string(),
                mode: "fft".to_string(),
                bins: FFT_BINS,
                fps: FFT_FPS,
            };
            let config_json = serde_json::to_string(&config).unwrap();
            let _ = write.send(Message::Text(config_json)).await;

            // Forward FFT data to client
            loop {
                tokio::select! {
                    result = rx.recv() => {
                        match result {
                            Ok(data) => {
                                if write.send(Message::Binary(data)).await.is_err() {
                                    break;
                                }
                            }
                            Err(_) => break,
                        }
                    }
                    msg = read.next() => {
                        match msg {
                            Some(Ok(_)) => continue,
                            _ => break,
                        }
                    }
                }
            }

            println!("Client disconnected: {}", addr);
        });
    }

    Ok(())
}
