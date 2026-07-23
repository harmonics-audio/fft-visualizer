# fft-visualizer-core

A high-performance, WebGL-based **real-time audio spectrum analyzer** and FFT
visualizer as a framework-agnostic **vanilla TypeScript class** — visualize the
microphone, tab/system audio, a WebSocket stream, or your own Web Audio data.

The entire visual — bars, LED segments, radial layout, gradient, glow, reflection —
is drawn by a single fragment shader in one GPU draw call, so it stays smooth even
at 120 fps with 80 bands in stereo.

This is the engine that powers [`fft-visualizer-vue`](https://www.npmjs.com/package/fft-visualizer-vue).
Use this package directly for vanilla JS/TS, or to build a wrapper for any other
framework.

## Highlights

- **Zero framework dependencies** — one class, `new FFTVisualizer(canvas, options)`
- **WebGL fragment-shader rendering** — the whole spectrum is one draw call; no per-bar canvas ops
- **Three data sources** — capture audio locally (mic or tab/system), stream pre-computed FFT over WebSocket, or feed your own data
- **In-browser FFT** — optional Rust/WASM FFT processor, lazy-loaded only when you capture audio locally
- **Rich visual modes** — LED segments (two styles), radial/circular, stereo, mirrored reflection, glow, rotation, per-level or per-axis coloring
- **Flexible gradients** — 10 built-in presets or custom stops in any CSS color format

## Installation

```bash
pnpm add fft-visualizer-core
# or: npm install fft-visualizer-core / yarn add fft-visualizer-core
```

## Quick start

The fastest way to see something is **local mode** — capture the microphone and
visualize it entirely in the browser, no backend required:

```ts
import { FFTVisualizer } from 'fft-visualizer-core'

const canvas = document.querySelector('canvas')!
const viz = new FFTVisualizer(canvas, {
  mode: 'local',
  bands: 40,
  gradient: 'aurora'
})

// ...when you're done (e.g. the view unmounts):
viz.destroy()
```

The visualizer sizes itself to the canvas's parent element and starts on
construction (the browser prompts for microphone permission in local mode). To
capture tab or system audio instead of the mic, set `audioSource: 'display'`.

> **Rendering fills the canvas's parent.** Give the parent a size, e.g.
> `<div style="width:100%;height:240px"><canvas></canvas></div>`.

## Data modes

The renderer has one job — draw a spectrum — and three ways to get the data,
selected with the `mode` option:

| Mode | How data arrives | Use when |
|------|------------------|----------|
| `local` | Captures mic or display audio and computes the FFT in-browser (Rust/WASM) | You want a zero-backend, client-side visualizer |
| `websocket` *(default)* | Connects to `websocketUrl` and reads **pre-computed** FFT frames | A server/device already produces FFT data (e.g. a Raspberry Pi) |
| `external` | You feed FFT magnitudes in via `feedData()` or the `data` option | You have your own audio pipeline (Web Audio, another analyser, etc.) |

```ts
// WebSocket
new FFTVisualizer(canvas, { mode: 'websocket', websocketUrl: 'ws://localhost:3001/fft', bands: 40 })

// External — push your own magnitudes each frame
const viz = new FFTVisualizer(canvas, { mode: 'external', bands: 80 })
viz.feedData(magnitudes /* Uint8Array(0-255) */)
// stereo: viz.feedData(mono, left, right)
```

Reference servers that stream FFT frames over WebSocket (Python, Node.js, Rust)
are in [`backend-examples/`](https://github.com/harmonics-audio/fft-visualizer/tree/main/backend-examples).

## Options

All options are optional and can be changed later with `setOptions(patch)`.

### Data source

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `mode` | `'websocket' \| 'local' \| 'external'` | `'websocket'` | Where FFT data comes from |
| `websocketUrl` | `string` | — | WebSocket URL (used when `mode: 'websocket'`) |
| `data` | `Uint8Array` | — | External FFT magnitudes, mono (used when `mode: 'external'`) |
| `dataLeft` / `dataRight` | `Uint8Array` | — | External FFT magnitudes per channel (stereo external mode) |
| `audioSource` | `'mic' \| 'display'` | `'mic'` | Local capture source (used when `mode: 'local'`) |
| `audioDeviceId` | `string` | — | Specific input device for local mic capture |
| `autoReconnect` | `boolean` | `false` | Reconnect the WebSocket with exponential backoff (1s→30s) after an unexpected drop |

### Data processing

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `bands` | `10 \| 20 \| 40 \| 80` | `80` | Number of frequency bands displayed (server bins are aggregated down to this) |
| `noiseFloor` | `number` | `0` | Cut magnitudes below this threshold (0–255) |
| `smoothing` | `number` | `0` | Temporal smoothing (0 = none, 0.9 = heavy) |
| `showPeaks` | `boolean` | `true` | Show falling peak indicators |
| `peakDecay` | `number` | `0.997` | Peak fall speed (0.99 = slow, 0.9 = fast) |
| `stereo` | `boolean` | `false` | Stereo mode: left channel top, right channel bottom (mono data is mirrored to both) |

### Appearance

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `ledBars` | `boolean` | `false` | LED segment effect |
| `ledShape` | `'segment' \| 'meter'` | `'segment'` | `segment` = fixed-pixel gap lines (identical at every resolution); `meter` = short, wide segments sized from bar width, like a classic LED meter |
| `lumiBars` | `boolean` | `false` | Full-height bars whose brightness follows the level |
| `radial` | `boolean` | `false` | Circular spectrum: angle = frequency, radius = level |
| `radialInnerRadius` | `number` | `0.35` | Radial: inner hole radius as a fraction of outer radius (0–0.9) |
| `barSpace` | `number` | `0.25` | Gap between bars as a fraction of bar width (0–0.9) |
| `reflexRatio` | `number` | `0` | Mirrored reflection (0 = off). Linear mono: fraction of height (max 0.7). Radial: > 0 mirrors bars inward inside the inner circle |
| `reflexAlpha` | `number` | `0.25` | Reflection brightness (0–1) |
| `glow` | `number` | `0` | Glow above the bar tops (0 = off, 1 = max) |
| `rotation` | `0 \| 90 \| 180 \| 270` | `0` | Rotate the whole visual clockwise, in degrees |
| `gradient` | `GradientName \| GradientStop[]` | `'classic'` | Bar colors: a preset name or custom stops |
| `gradientDirection` | `'vertical' \| 'horizontal'` | `'vertical'` | Gradient axis |
| `colorMode` | `'gradient' \| 'bar-level'` | `'gradient'` | `bar-level` colors each whole bar by its current level instead of by the gradient axis |
| `background` | `string` | `'#0a0a0a'` | Background behind and between the bars. Any CSS color, including `'transparent'` or `rgba(…)` for a see-through canvas (opaque vs. transparent is fixed at construction) |
| `debug` | `boolean` | `false` | Log connection/config diagnostics to the console |

## API

```ts
const viz = new FFTVisualizer(canvas, options)
```

### Methods

| Method | Description |
|--------|-------------|
| `setOptions(patch)` | Apply a partial options update. Diffed per key, so only what changed does work (re-parse background, reload gradient, reallocate buffers, reconnect, …) |
| `feedData(data, left?, right?)` | Push external FFT magnitudes (`mode: 'external'`) |
| `connect()` | (Re)start the active source. Called automatically on construction |
| `disconnect()` | Stop the active source (closes the socket / stops capture) |
| `refreshGradient()` | Re-upload the gradient LUT after mutating the current stops array in place |
| `getAudioDevices()` | `Promise<AudioDevice[]>` — enumerate audio inputs (prompts for mic permission) |
| `destroy()` | Disconnect, free WebGL/WASM resources, and stop observing resize. Call when tearing down |

### Getters

| Getter | Type | Description |
|--------|------|-------------|
| `isConnected` | `boolean` | Whether the active source is connected/capturing |
| `fps` | `number` | Current render rate (updated ~once per second) |
| `audioDevices` | `AudioDevice[]` | Known audio input devices (local mode) |
| `activeAudioDeviceId` | `string \| undefined` | Currently captured device |

### Events

`on(event, handler)` returns an unsubscribe function; `off(event, handler)` also works.

```ts
const stop = viz.on('frame', ({ data, left, right }) => {
  // data: Uint8Array of per-bar magnitudes (0-255). left/right null unless stereo.
})
stop() // unsubscribe
```

| Event | Payload | Fires when |
|-------|---------|-----------|
| `connected` | — | The source connects / capture starts |
| `disconnected` | — | The source disconnects / capture stops |
| `error` | `string` | A connection or capture error occurs |
| `frame` | `{ data, left, right }` | Once per processed audio frame, with display bar magnitudes |
| `audiostate` | — | Local-audio capture state or the device list changed |

## Gradients

Bar colors are rasterized into a lookup texture, so any CSS color and native
gradient interpolation work. Pass a preset name or an array of custom stops:

```ts
import { FFTVisualizer, gradientNames } from 'fft-visualizer-core'

// 10 presets: classic, rainbow, blue, prism, orangered, steelblue, sunset, aurora, dusk, mono
new FFTVisualizer(canvas, { mode: 'local', gradient: 'sunset' })

// Custom stops (pos 0–1, any CSS color)
new FFTVisualizer(canvas, {
  mode: 'local',
  gradient: [
    { pos: 0, color: '#001' },
    { pos: 0.6, color: 'deepskyblue' },
    { pos: 1, color: 'white' }
  ]
})
```

Helpers `gradientPresets`, `gradientNames`, `resolveGradientStops`, and
`buildGradientLUT` are exported for building your own gradient UI.

## Low-level building blocks

For advanced use, the engines the class is built on are exported individually:

- `createLocalAudio(options)` — mic / system-audio capture → FFT via WASM, surfaced through `onData` / `onStateChange` callbacks
- `createWebSocketFft(options)` — client-side FFT of a raw PCM WebSocket stream
- `pcmToChannels`, and the gradient helpers above

The raw Rust/WASM FFT processor is exported from a **dedicated subpath** so the
main entry never pulls WASM in eagerly — import it only when you need it:

```ts
import { FftProcessor } from 'fft-visualizer-core/wasm'
```

## License

[MIT](https://github.com/harmonics-audio/fft-visualizer/blob/main/LICENSE) © Wouter Vernaillen
