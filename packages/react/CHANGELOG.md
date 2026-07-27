# @fft-visualizer/react

## 1.0.0

### Major Changes

- b78c915: First stable release. 🎉

  This release declares the public API stable: the shared options surface of the core class and the Vue/React wrappers, the three data modes (`websocket`, `local`, `external`), the WebSocket frame protocol, the gradient system, and the `/wasm` FFT entry point. From here on, anything breaking ships in a new major.

### Patch Changes

- Updated dependencies [b78c915]
  - @fft-visualizer/core@1.0.0

## 0.5.0

### Minor Changes

- 19f8c16: **New: `@fft-visualizer/react`** — a thin React wrapper around
  `@fft-visualizer/core`, mirroring `@fft-visualizer/vue`.

  - `<FFTVisualizer>` takes the core's options as props (plus `showStats`,
    `renderStats`, `className`, `style`) and diffs them onto the core's imperative
    API; unset props keep the core's own defaults.
  - Callbacks `onConnected` / `onDisconnected` / `onError` / `onFrame` are read
    through a ref, so inline handlers never resubscribe or restart the visualizer.
  - A ref exposes `connect`, `disconnect`, `feedData`, `getAudioDevices`,
    `isConnected`, `audioDevices` and `activeAudioDeviceId` — `feedData` avoids a
    React render per frame in `mode="external"`.
  - Custom gradient stops are compared by value, so inline arrays don't rebuild the
    gradient texture on every render.
  - One peer dependency (React 18 or 19); styles ship as
    `@fft-visualizer/react/style.css` and the WASM FFT is re-exported from
    `@fft-visualizer/react/wasm`.

### Patch Changes

- Updated dependencies [9323548]
- Updated dependencies [b14efc4]
  - @fft-visualizer/core@0.5.0
