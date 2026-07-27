# @fft-visualizer/core

## 1.0.0

### Major Changes

- b78c915: First stable release. 🎉

  This release declares the public API stable: the shared options surface of the core class and the Vue/React wrappers, the three data modes (`websocket`, `local`, `external`), the WebSocket frame protocol, the gradient system, and the `/wasm` FFT entry point. From here on, anything breaking ships in a new major.

## 0.5.0

### Minor Changes

- 9323548: Split the library into a framework-agnostic core and a thin Vue wrapper.

  - **New: `@fft-visualizer/core`** — the WebGL renderer, WebSocket client, and
    local-audio (mic / display) FFT engine as a vanilla TypeScript
    `FFTVisualizer` class, usable without any framework.
  - **`@fft-visualizer/vue`** (renamed from `vue-fft-visualizer`) is now a thin
    wrapper around the core class. Existing users must update the dependency name
    and imports from `vue-fft-visualizer` to `@fft-visualizer/vue`; the component
    API is unchanged.
  - The raw WASM `FftProcessor` now loads lazily and is exported only from the
    `@fft-visualizer/core/wasm` subpath, so the main entry no longer pulls WASM in
    eagerly.

### Patch Changes

- b14efc4: `reflexRatio` now scales the reflection instead of only shrinking the analyzer.

  - **Linear (mono):** the reflection is scaled to the band `reflexRatio` reserves,
    so a full-height bar mirrors exactly down to the canvas bottom. It was
    previously fixed at half the bar height, which left the reserved band partly
    empty above `reflexRatio ≈ 0.33` — past that point the slider did nothing but
    push the analyzer upward. Values at or below ~0.35 look near-identical to
    before; higher values now produce a correspondingly deeper reflection.
  - **Radial:** `reflexRatio` was read only as an on/off flag, so every value > 0
    rendered the same inner reflection. It now scales how far the mirror reaches
    inward, as a fraction of the bars' radial length (`0.5` reproduces the old
    fixed-half look, and is clipped at the centre when the inner circle is
    smaller than the mirror).

  Reaches `@fft-visualizer/vue` and `@fft-visualizer/react` through the core
  renderer; no API change in any package.
