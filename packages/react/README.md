# @fft-visualizer/react

A high-performance, WebGL-based **real-time audio spectrum analyzer** and FFT
visualizer component for React — visualize the microphone, tab/system audio, a
WebSocket stream, or your own Web Audio data.

The entire visual — bars, LED segments, radial layout, gradient, glow, reflection —
is drawn by a single fragment shader in one GPU draw call, so it stays smooth even
at 120 fps with 80 bands in stereo.

🔗 Live demo: https://demo.fftvisualizer.com · Docs: https://fftvisualizer.com

## Highlights

- **WebGL fragment-shader rendering** — the whole spectrum is one draw call; no per-bar canvas ops
- **Three data sources** — capture audio locally (mic or tab/system), stream pre-computed FFT over WebSocket, or feed your own data via props
- **In-browser FFT** — optional Rust/WASM FFT processor (lazy-loaded only when you capture audio locally)
- **Rich visual modes** — LED segments (two styles), radial/circular, stereo, mirrored reflection, glow, rotation, per-level or per-axis coloring
- **Flexible gradients** — 10 built-in presets or custom stops in any CSS color format
- **One peer dependency** — just React; rendering uses native WebGL
- **SSR-safe** — every browser API is touched inside `useEffect`, so server rendering emits markup only

## Installation

```bash
pnpm add @fft-visualizer/react
# or: npm install @fft-visualizer/react / yarn add @fft-visualizer/react
```

Import the stylesheet once, anywhere in your app (it sizes the canvas and styles
the stats overlay):

```ts
import '@fft-visualizer/react/style.css'
```

## Quick start

The fastest way to see something is **local mode** — capture the microphone and
visualize it entirely in the browser, no backend required:

```tsx
import { FFTVisualizer } from '@fft-visualizer/react'
import '@fft-visualizer/react/style.css'

export function Viz() {
  // The component fills its container — give it a height
  return (
    <div style={{ width: '100%', height: 240 }}>
      <FFTVisualizer mode="local" bands={40} gradient="aurora" />
    </div>
  )
}
```

The browser will prompt for microphone permission on mount. To capture tab or
system audio instead of the mic, set `audioSource="display"`.

### Next.js / React Server Components

The component renders on the server, but it needs the browser to do anything, so
it belongs in a client component:

```tsx
'use client'

import { FFTVisualizer } from '@fft-visualizer/react'
```

## Data modes

The component has one job — render a spectrum — and three ways to get the data,
selected with the `mode` prop:

| Mode | How data arrives | Use when |
|------|------------------|----------|
| `local` | Captures mic or display audio and computes the FFT in-browser (Rust/WASM) | You want a zero-backend, client-side visualizer |
| `websocket` *(default)* | Connects to `websocketUrl` and reads **pre-computed** FFT frames | A server/device already produces FFT data (e.g. a Raspberry Pi) |
| `external` | You pass FFT magnitudes via the `data` / `dataLeft` / `dataRight` props | You have your own audio pipeline (Web Audio, another analyser, etc.) |

### Local mode

```tsx
<FFTVisualizer mode="local" audioSource="mic" bands={80} />
```

### WebSocket mode

```tsx
<FFTVisualizer mode="websocket" websocketUrl="ws://localhost:3001/fft" bands={40} />
```

The server streams a small config message then binary FFT frames — see
[WebSocket protocol](#websocket-protocol). Reference servers for Python, Node.js
and Rust are in
[`backend-examples/`](https://github.com/harmonics-audio/fft-visualizer/tree/main/backend-examples).

### External mode

Pass a `Uint8Array` of magnitudes (0–255). For stereo, pass `dataLeft` and
`dataRight` instead of `data`.

```tsx
<FFTVisualizer mode="external" data={data} bands={40} />
```

> **Note:** the `data` prop is compared by reference, so mutating the *same*
> `Uint8Array` in place won't be picked up. Either set a fresh array in state, or
> — better for per-frame updates — call `feedData()` on the ref (below), which
> copies the data and skips a React render per frame.

## Props

Props are the core visualizer's options, so anything valid for
[`@fft-visualizer/core`](https://www.npmjs.com/package/@fft-visualizer/core) works
here. Unset props keep the core's default.

### Data source

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `mode` | `'websocket' \| 'local' \| 'external'` | `'websocket'` | Where FFT data comes from |
| `websocketUrl` | `string` | — | WebSocket URL (used when `mode="websocket"`) |
| `data` | `Uint8Array` | — | External FFT magnitudes, mono (used when `mode="external"`) |
| `dataLeft` / `dataRight` | `Uint8Array` | — | External FFT magnitudes per channel (stereo external mode) |
| `audioSource` | `'mic' \| 'display'` | `'mic'` | Local capture source (used when `mode="local"`) |
| `audioDeviceId` | `string` | — | Specific input device for local mic capture |
| `autoReconnect` | `boolean` | `false` | Reconnect the WebSocket with exponential backoff (1s→30s) after an unexpected drop |

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
| `reflexRatio` | `number` | `0` | Mirrored reflection (0 = off; max 0.7). Linear mono: fraction of the canvas height given to the reflection. Radial: how far the mirror reaches inward, as a fraction of the bars’ radial length |
| `reflexAlpha` | `number` | `0.25` | Reflection brightness (0–1) |
| `glow` | `number` | `0` | Glow above the bar tops (0 = off, 1 = max) |
| `rotation` | `0 \| 90 \| 180 \| 270` | `0` | Rotate the whole visual clockwise, in degrees |
| `gradient` | `GradientName \| GradientStop[]` | `'classic'` | Bar colors: a preset name or custom stops |
| `gradientDirection` | `'vertical' \| 'horizontal'` | `'vertical'` | Gradient axis |
| `colorMode` | `'gradient' \| 'bar-level'` | `'gradient'` | `bar-level` colors each whole bar by its current level instead of by the gradient axis |
| `background` | `string` | `'#0a0a0a'` | Background behind and between the bars. Any CSS color, including `'transparent'` or `rgba(…)` for a see-through canvas that blends into your page (opaque vs. transparent is fixed at mount) |
| `debug` | `boolean` | `false` | Log connection/config diagnostics to the console (quiet by default) |

### React-only props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `showStats` | `boolean` | `true` | Show the small connection/fps overlay in the corner |
| `renderStats` | `(state: { connected, bands, fps }) => ReactNode` | — | Replace the overlay's content with your own (only rendered when `showStats`) |
| `className` | `string` | — | Extra class names on the root element |
| `style` | `CSSProperties` | — | Extra styles on the root element |

## Gradients

Bar colors are rasterized into a 256×1 lookup texture, so any CSS color and native
gradient interpolation work. Pass a preset name or an array of custom stops:

```tsx
// Preset
<FFTVisualizer mode="local" gradient="sunset" />

// Custom stops (any CSS color format)
<FFTVisualizer
  mode="local"
  gradient={[
    { stop: 0, color: '#001233' },
    { stop: 0.5, color: 'rgb(15, 155, 142)' },
    { stop: 1, color: 'hsl(280, 95%, 75%)' }
  ]}
/>
```

Custom stops are compared **by value**, so an inline array like the one above is
fine — the gradient texture is only rebuilt when the colors actually change.

Built-in presets (exported as `gradientPresets` / `gradientNames`):
`classic`, `rainbow`, `blue`, `prism`, `orangered`, `steelblue`, `sunset`,
`aurora`, `dusk`, `mono`.

Gradient helpers are exported for building settings UIs or your own rendering:
`resolveGradientStops`, `buildGradientLUT`, and the `GradientStop` /
`GradientName` / `GradientInput` types.

## Callbacks

| Prop | Payload | Description |
|------|---------|-------------|
| `onConnected` | — | Data source became active (WS connected / capture started / external started) |
| `onDisconnected` | — | Data source stopped |
| `onError` | `string` | Error message (WS error, capture failure, WebGL init failure) |
| `onFrame` | `(data, left, right)` | Called once per processed audio frame with the display bar magnitudes (see below) |

Callbacks are read from a ref, so inline arrow functions are fine — changing one
never resubscribes or restarts the visualizer.

### `onFrame`

Fires once per processed audio frame with the same bar values the shader draws —
useful for driving external hardware (LED strips, flip-dot displays, …) without
re-implementing the FFT. It's listener-gated, so it costs nothing when unused.

```tsx
// data:  Uint8Array — one 0–255 magnitude per bar (length = `bands`)
// left/right: per-channel arrays in stereo mode, else null
//             (in stereo, `data` is the per-bar max of both channels)
function onFrame(data: Uint8Array, left: Uint8Array | null, right: Uint8Array | null) {
  const rows = 14                       // e.g. dots per column on a flip-dot panel
  data.forEach((v, col) => {
    const lit = Math.round((v / 255) * rows)
    // light dots 0..lit-1 in column `col`
  })
}

<FFTVisualizer mode="local" bands={28} onFrame={onFrame} />
```

## Imperative handle

Attach a ref for manual control:

```tsx
import { useRef } from 'react'
import { FFTVisualizer, type FFTVisualizerHandle } from '@fft-visualizer/react'

const viz = useRef<FFTVisualizerHandle>(null)

// Manual connection control
viz.current?.connect()
viz.current?.disconnect()
viz.current?.isConnected            // boolean

// Feed FFT frames imperatively (mode="external") — copies the data, so it works
// even when you reuse one buffer each frame, and avoids a render per frame
viz.current?.feedData(mono)                 // Uint8Array
viz.current?.feedData(mono, left, right)    // stereo

// Local-audio device management
await viz.current?.getAudioDevices()   // Promise<AudioDevice[]> (prompts for mic permission)
viz.current?.audioDevices              // AudioDevice[]
viz.current?.activeAudioDeviceId       // string | undefined

<FFTVisualizer ref={viz} mode="local" />
```

## Standalone audio engines

The data pipelines are framework-agnostic and live in the core package — use them
directly (with `mode="external"`, or to drive your own rendering):

```ts
import { createLocalAudio, createWebSocketFft } from '@fft-visualizer/core'
```

`createLocalAudio` captures mic/display audio and runs the WASM FFT;
`createWebSocketFft` computes the FFT in-browser from a **raw PCM** WebSocket
stream. Both are callback-driven, which keeps per-frame data out of React state.
The raw WASM processor is also re-exported from `@fft-visualizer/react/wasm`.

## WebSocket protocol

`mode="websocket"` expects a server that sends **pre-computed** FFT frames: one
JSON config message on connect, then a binary `uint8` (0–255) per frequency bin,
`bins` bytes per frame.

```json
{ "type": "config", "mode": "fft", "bins": 80, "fps": 120 }
```

The full spec and reference servers (Python, Node.js, Rust) are in the
[repository](https://github.com/harmonics-audio/fft-visualizer/tree/main/backend-examples)
and on the [docs site](https://fftvisualizer.com).

## Related packages

| Package | For |
|---------|-----|
| [`@fft-visualizer/core`](https://www.npmjs.com/package/@fft-visualizer/core) | Vanilla JS/TS, or any other framework |
| [`@fft-visualizer/vue`](https://www.npmjs.com/package/@fft-visualizer/vue) | Vue 3 |

## License

MIT © Wouter Vernaillen
