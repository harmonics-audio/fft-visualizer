---
"fft-visualizer-core": minor
"fft-visualizer-vue": minor
---

Split the library into a framework-agnostic core and a thin Vue wrapper.

- **New: `fft-visualizer-core`** — the WebGL renderer, WebSocket client, and
  local-audio (mic / display) FFT engine as a vanilla TypeScript
  `FFTVisualizer` class, usable without any framework.
- **`fft-visualizer-vue`** (renamed from `vue-fft-visualizer`) is now a thin
  wrapper around the core class. Existing users must update the dependency name
  and imports from `vue-fft-visualizer` to `fft-visualizer-vue`; the component
  API is unchanged.
- The raw WASM `FftProcessor` now loads lazily and is exported only from the
  `fft-visualizer-core/wasm` subpath, so the main entry no longer pulls WASM in
  eagerly.
