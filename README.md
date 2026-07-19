# vue-fft-visualizer

A high-performance, WebGL-based **real-time audio spectrum analyzer** and FFT
visualizer component for Vue 3 — visualize the microphone, tab/system audio, a
WebSocket stream, or your own Web Audio data.

The entire visual — bars, LED segments, radial layout, gradient, glow, reflection —
is drawn by a single fragment shader in one GPU draw call, so it stays smooth even
at 120 fps with 80 bands in stereo.

<!-- 🔗 Live demo: https://<your-vercel-url>  (fill in after deploying the playground) -->
<!-- ![FFT Visualizer demo](docs/demo.gif)   (add a recorded GIF here) -->

## Highlights

- **WebGL fragment-shader rendering** — the whole spectrum is one draw call; no per-bar canvas ops
- **Three data sources** — capture audio locally (mic or tab/system), stream pre-computed FFT over WebSocket, or feed your own data via props
- **In-browser FFT** — optional Rust/WASM FFT processor (lazy-loaded only when you capture audio locally)
- **Rich visual modes** — LED segments (two styles), radial/circular, stereo, mirrored reflection, glow, rotation, per-level or per-axis coloring
- **Flexible gradients** — 10 built-in presets or custom stops in any CSS color format
- **One peer dependency** — just Vue 3; rendering uses native WebGL
- **SSR-safe** — all browser access is deferred to `onMounted`; works with Nuxt via `<ClientOnly>`

## Installation

```bash
pnpm add vue-fft-visualizer
# or: npm install vue-fft-visualizer / yarn add vue-fft-visualizer
```

## Quick start

The fastest way to see something is **local mode** — capture the microphone and
visualize it entirely in the browser, no backend required:

```vue
<script setup>
import { FFTVisualizer } from 'vue-fft-visualizer'
</script>

<template>
  <div class="viz">
    <FFTVisualizer mode="local" :bands="40" gradient="aurora" />
  </div>
</template>

<style>
/* The component fills its container — give it a height */
.viz { width: 100%; height: 240px; }
</style>
```

The browser will prompt for microphone permission on mount. To capture tab or
system audio instead of the mic, set `audio-source="display"`.

## Data modes

The component has one job — render a spectrum — and three ways to get the data,
selected with the `mode` prop:

| Mode | How data arrives | Use when |
|------|------------------|----------|
| `local` | Captures mic or display audio and computes the FFT in-browser (Rust/WASM) | You want a zero-backend, client-side visualizer |
| `websocket` *(default)* | Connects to `websocketUrl` and reads **pre-computed** FFT frames | A server/device already produces FFT data (e.g. a Raspberry Pi) |
| `external` | You pass FFT magnitudes via the `data` / `dataLeft` / `dataRight` props | You have your own audio pipeline (Web Audio, another analyser, etc.) |

### Local mode

```vue
<FFTVisualizer mode="local" audio-source="mic" :bands="80" />
```

### WebSocket mode

```vue
<FFTVisualizer mode="websocket" websocket-url="ws://localhost:3001/fft" :bands="40" />
```

The server streams a small config message then binary FFT frames — see
[WebSocket protocol](#websocket-protocol). Reference servers for Python, Node.js
and Rust are in [`backend-examples/`](./backend-examples).

### External mode

Pass a `Uint8Array` of magnitudes (0–255); update it and the visual follows.
For stereo, pass `dataLeft` and `dataRight` instead of `data`.

```vue
<script setup>
import { ref } from 'vue'
import { FFTVisualizer } from 'vue-fft-visualizer'

const data = ref(new Uint8Array(80))
// ...fill `data.value` from your own analyser each frame (assign a new array,
// or call the exposed feedData() method — see notes below)
</script>

<template>
  <FFTVisualizer mode="external" :data="data" :bands="40" :stereo="false" />
</template>
```

> **Note:** the `data` prop is watched by reference. If you mutate the *same*
> `Uint8Array` in place each frame, Vue won't detect the change — either assign a
> fresh array, or use the component's imperative feed (see [Exposed](#exposed-methods)).

## Props

### Data source

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `mode` | `'websocket' \| 'local' \| 'external'` | `'websocket'` | Where FFT data comes from |
| `websocketUrl` | `string` | — | WebSocket URL (used when `mode="websocket"`) |
| `data` | `Uint8Array` | — | External FFT magnitudes, mono (used when `mode="external"`) |
| `dataLeft` / `dataRight` | `Uint8Array` | — | External FFT magnitudes per channel (stereo external mode) |
| `audioSource` | `'mic' \| 'display'` | `'mic'` | Local capture source (used when `mode="local"`) |
| `audioDeviceId` | `string` | — | Specific input device for local mic capture |

### Data processing

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `bands` | `10 \| 20 \| 40 \| 80` | `80` | Number of frequency bands displayed (server bins are aggregated down to this) |
| `noiseFloor` | `number` | `0` | Cut magnitudes below this threshold (0–255) |
| `smoothing` | `number` | `0` | Temporal smoothing (0 = none, 0.9 = heavy) |
| `showPeaks` | `boolean` | `true` | Show falling peak indicators |
| `peakDecay` | `number` | `0.997` | Peak fall speed (0.99 = slow, 0.9 = fast) |
| `stereo` | `boolean` | `false` | Stereo mode: left channel top, right channel bottom (mono data is mirrored to both) |

### Appearance

| Prop | Type | Default | Description |
|------|------|---------|-------------|
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

## Gradients

Bar colors are rasterized into a 256×1 lookup texture, so any CSS color and native
gradient interpolation work. Pass a preset name or an array of custom stops:

```vue
<!-- Preset -->
<FFTVisualizer mode="local" gradient="sunset" />

<!-- Custom stops (any CSS color format) -->
<FFTVisualizer
  mode="local"
  :gradient="[
    { stop: 0, color: '#001233' },
    { stop: 0.5, color: 'rgb(15, 155, 142)' },
    { stop: 1, color: 'hsl(280, 95%, 75%)' }
  ]"
/>
```

Built-in presets (exported as `gradientPresets` / `gradientNames`):
`classic`, `rainbow`, `blue`, `prism`, `orangered`, `steelblue`, `sunset`,
`aurora`, `dusk`, `mono`.

Gradient helpers are exported for building settings UIs or your own rendering:
`resolveGradientStops`, `buildGradientLUT`, `GRADIENT_LUT_SIZE`, and the
`GradientStop` / `GradientName` / `GradientInput` types.

## Events

| Event | Payload | Description |
|-------|---------|-------------|
| `connected` | — | Data source became active (WS connected / capture started / external started) |
| `disconnected` | — | Data source stopped |
| `error` | `string` | Error message (WS error, capture failure, WebGL init failure) |

## Exposed methods

Access via a template ref:

```vue
<script setup>
import { ref } from 'vue'
const viz = ref()

// Manual connection control
viz.value.connect()
viz.value.disconnect()
viz.value.isConnected          // Ref<boolean>

// Local-audio device management
await viz.value.getAudioDevices()   // Promise<AudioDevice[]> (prompts for mic permission)
viz.value.audioDevices              // Ref<AudioDevice[]>
viz.value.activeAudioDeviceId       // Ref<string | undefined>
</script>

<template>
  <FFTVisualizer ref="viz" mode="local" />
</template>
```

## Composables

The data pipelines are also available standalone, if you want to drive your own
rendering or combine them with `mode="external"`.

### `useLocalAudio(options?)`

Captures mic or display audio and runs the WASM FFT.

```ts
const {
  fftData,        // Ref<Uint8Array> — magnitudes 0–255
  isActive, sourceType, devices, activeDeviceId,
  getDevices,     // () => Promise<AudioDevice[]>
  start,          // (deviceId?) => Promise<void>  — microphone
  startDisplay,   // () => Promise<void>           — tab/system audio
  stop
} = useLocalAudio({ fftSize: 2048, bins: 80, startFreq: 100, endFreq: 18000 })
```

### `useWebSocketFft(options?)`

Connects to a WebSocket that streams **raw PCM** and computes the FFT in-browser
via WASM (distinct from the component's `websocket` mode, which expects
pre-computed FFT). Feed its `fftData` into the component with `mode="external"`.

```ts
const {
  fftData, fftDataLeft, fftDataRight, isConnected,
  connect,        // (url) => void
  disconnect,
  processSamples  // (Float32Array) => void — feed PCM manually
} = useWebSocketFft({ fftSize: 2048, bins: 80, overlap: 0.5 })
```

The raw WASM FFT processor is also exported from `vue-fft-visualizer/wasm` if you
want to use it directly.

## WebSocket protocol

`mode="websocket"` expects a server that sends **pre-computed** FFT frames:

**1. Config message (JSON), once on connect:**

```json
{ "type": "config", "mode": "fft", "bins": 80, "fps": 120 }
```

**2. Binary FFT frames, continuously:**

- One `uint8` (0–255) per frequency bin — `bins` bytes per frame
- 0 = silence, 255 = maximum amplitude
- Typically 100 Hz – 18 kHz, exponentially spaced

For best results the server should: capture at 48 kHz+, apply a Hann/Hamming
window, compute a 1024–2048-point FFT, map to exponentially-spaced bands, apply
A-weighting, convert to dB, normalize to 0–255, and stream at 60–120 fps.

## Backend examples

Reference servers that capture system audio, compute FFT, and stream it:

- **[Python](./backend-examples/python/)** — pyalsaaudio + numpy (incl. a Raspberry Pi variant)
- **[Node.js](./backend-examples/nodejs/)** — node-audiorecorder + fft.js
- **[Rust](./backend-examples/rust/)** — cpal + rustfft

## SSR / Nuxt

The component touches `window`, `navigator`, and WebGL only inside `onMounted` and
event handlers, and the gradient rasterizer guards against a missing DOM — so it is
safe to import in SSR/Nuxt apps. Because it renders nothing meaningful on the
server, wrap it in `<ClientOnly>`:

```vue
<ClientOnly>
  <FFTVisualizer mode="local" />
</ClientOnly>
```

## Why this vs. a canvas visualizer?

Most spectrum visualizers (e.g. audioMotion-analyzer) draw to a 2D canvas. This
one renders the entire frame — every bar, LED gap, gradient, glow and reflection —
in a **single WebGL fragment shader / draw call**, which keeps it cheap at high
band counts and frame rates. It also ships a **WebSocket remote-FFT protocol** with
reference servers, so the FFT can run on a separate device (a Raspberry Pi, a
media server) and the browser only draws — a case canvas visualizers don't cover.

## Browser support

Requires WebGL (all modern browsers): Chrome 56+, Firefox 51+, Safari 15+, Edge 79+.
Local capture additionally needs `getUserMedia` / `getDisplayMedia`.

## Development

```bash
pnpm install       # install deps
pnpm dev           # playground dev server
pnpm build         # build the library (vue-tsc + vite)
pnpm build:wasm    # rebuild the Rust/WASM FFT processor (needs wasm-pack)
pnpm typecheck     # type-check only
```

## License

MIT © Wouter Vernaillen
