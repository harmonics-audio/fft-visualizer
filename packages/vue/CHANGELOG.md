# Changelog

## 1.0.0

### Major Changes

- b78c915: First stable release. 🎉

  This release declares the public API stable: the shared options surface of the core class and the Vue/React wrappers, the three data modes (`websocket`, `local`, `external`), the WebSocket frame protocol, the gradient system, and the `/wasm` FFT entry point. From here on, anything breaking ships in a new major.

### Patch Changes

- Updated dependencies [b78c915]
  - @fft-visualizer/core@1.0.0

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

- Updated dependencies [9323548]
- Updated dependencies [b14efc4]
  - @fft-visualizer/core@0.5.0

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `frame` event: emitted once per processed audio frame with the display bar
  magnitudes (`Uint8Array`, 0–255, one per band). In mono modes `left`/`right` are
  `null`; in stereo `data` is the per-bar max of both channels and `left`/`right`
  carry each side. Useful for driving external hardware (LED strips, flip-dot
  displays, etc.). Listener-gated, so it costs nothing when unused.

## [0.3.0] - 2026-07-19

### Added

- `ledShape` prop (`'segment' | 'meter'`): `segment` renders fixed-pixel LED gap
  lines (2px every 20px, identical at any resolution/DPR); `meter` renders short,
  wide segments sized from bar width, like a classic LED meter
- LED Shape selector in the playground
- `background` prop: set the color behind and between the bars — any CSS color,
  including `'transparent'` / `rgba(…)` for a see-through, page-blending canvas
- Canvas uses `preserveDrawingBuffer`, so `canvas.toDataURL()` can screenshot the visual
- `showStats` prop + `stats` slot: hide or fully replace the corner overlay
- `autoReconnect` prop (and `autoReconnect` option on `useWebSocketFft`): reconnect
  the WebSocket with exponential backoff (1s→30s) after an unexpected drop
- `debug` prop: gate connection/config console logging (quiet by default)
- `feedData(mono, left?, right?)` exposed method: push FFT frames imperatively;
  copies the data so reusing one buffer per frame works (the `data` prop is
  watched by reference and won't react to in-place mutation)

### Changed

- LED gaps are now anchored to device pixels instead of scaling with bar height,
  so they look consistent at every canvas size and resolution
- Peak markers render solid instead of snapping to the old 64-segment LED grid
- Canvas rescales via `ResizeObserver` on the container (was a `window` resize
  listener), so it tracks any layout change, not just window resizes
- Connection/config logging is now silent unless `debug` is set
- Canvas has an `aria-label` / `role="img"` for accessibility

### Fixed

- Playground no longer ships hardcoded private-LAN `ws://` URLs (caused a
  mixed-content "insecure" flag on the HTTPS demo); WebSocket URL is now an input

## [0.2.0] - 2026-07-18 (unpublished)

### Added

- `lumiBars` prop: full-height bars whose brightness follows the level
- `radial` mode with `radialInnerRadius`: circular spectrum (angle = frequency, radius = level)
- `barSpace` prop: configurable gap between bars
- `reflexRatio` / `reflexAlpha` props: mirrored reflection below the bars (linear)
  or inside the inner circle (radial)
- `glow` prop: soft light rising from the bar tops
- `rotation` prop: rotate the whole visual by 0/90/180/270 degrees
- `colorMode` prop: `'bar-level'` colors each whole bar by its current level
- `gradientDirection` prop: vertical or horizontal gradient axis
- Gradient system: 10 built-in presets plus custom stops in any CSS color format,
  sampled from a 256×1 lookup texture (`gradientPresets`, `gradientNames`,
  `resolveGradientStops`, `buildGradientLUT` exports)
- Playground: user presets persisted in localStorage

## [0.1.2] - 2026-07-16

### Changed

- Dependency upgrades

## [0.1.1] - 2026-07-16

### Added

- Stereo mode: left/right channels rendered mirrored around a center divider,
  with mono-to-stereo mirroring when only mono data is available
- `overlap` option in `useWebSocketFft`: overlapping FFT windows for lower
  latency and smoother bar motion
- 16/24/32-bit PCM decoding in `useWebSocketFft`

## [0.1.0] - 2026-04-25

### Added

- Initial release: WebGL fragment-shader spectrum visualizer for Vue 3
- Three data modes: WebSocket (pre-computed FFT frames), local (mic or display
  audio via Rust/WASM FFT), external (data via props)
- `bands` (10/20/40/80), `ledBars`, `showPeaks` / `peakDecay`, `noiseFloor`,
  `smoothing` props
- `useLocalAudio` and `useWebSocketFft` composables
- Backend reference implementations: Python, Node.js, Rust
- Playground app
