# vue-fft-visualizer

A high-performance WebGL-based FFT spectrum visualizer component for Vue 3.

![FFT Visualizer Demo](docs/demo.gif)

## Features

- **WebGL Rendering** - GPU-accelerated for smooth 120fps visualization
- **Zero Dependencies** - Only requires Vue 3, uses native WebGL
- **Configurable Bands** - Display 10, 20, 40, or 80 frequency bands
- **LED Effect** - Optional LED segment display mode
- **Peak Indicators** - Falling peak markers with configurable decay
- **Responsive** - Automatically adapts to container size

## Installation

```bash
npm install vue-fft-visualizer
# or
pnpm add vue-fft-visualizer
# or
yarn add vue-fft-visualizer
```

## Usage

```vue
<script setup>
import { FFTVisualizer } from 'vue-fft-visualizer'
</script>

<template>
  <FFTVisualizer
    websocket-url="ws://localhost:3001/fft"
    :bands="40"
    :led-bars="true"
    :show-peaks="true"
  />
</template>

<style>
/* Container needs a defined height */
.visualizer-container {
  height: 200px;
}
</style>
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `websocketUrl` | `string` | **required** | WebSocket URL to connect to for FFT data |
| `bands` | `10 \| 20 \| 40 \| 80` | `80` | Number of frequency bands to display |
| `showPeaks` | `boolean` | `true` | Show falling peak indicators |
| `peakDecay` | `number` | `0.997` | Peak decay rate (0.99 = slow, 0.9 = fast) |
| `ledBars` | `boolean` | `false` | Enable LED segment effect |
| `lumiBars` | `boolean` | `false` | Full-height bars whose brightness follows the level |
| `radial` | `boolean` | `false` | Circular spectrum: angle = frequency, radius = level |
| `radialInnerRadius` | `number` | `0.35` | Radial mode: inner hole radius as fraction of outer radius (0-0.9) |
| `barSpace` | `number` | `0.25` | Gap between bars as fraction of bar width (0-0.9) |
| `reflexRatio` | `number` | `0` | Mirrored reflection (0 = off). Linear mono: height fraction (max 0.7). Radial: > 0 mirrors bars inward inside the inner circle |
| `reflexAlpha` | `number` | `0.25` | Reflection brightness (0-1) |
| `glow` | `number` | `0` | Glow above the bar tops (0 = off, 1 = max) |
| `rotation` | `0 \| 90 \| 180 \| 270` | `0` | Rotate the whole visual clockwise, in degrees |
| `gradient` | `GradientName \| GradientStop[]` | `'classic'` | Bar color gradient: a preset name or custom stops |
| `gradientDirection` | `'vertical' \| 'horizontal'` | `'vertical'` | Gradient axis |
| `colorMode` | `'gradient' \| 'bar-level'` | `'gradient'` | `'bar-level'` colors each whole bar by its current level instead of the gradient axis |

### Gradients

Bar colors are sampled from a 256×1 lookup texture, so any CSS-color gradient
works. Pass a preset name or an array of custom stops:

```vue
<!-- Preset -->
<FFTVisualizer websocket-url="ws://..." gradient="aurora" />

<!-- Custom stops (any CSS color format) -->
<FFTVisualizer
  websocket-url="ws://..."
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

## Events

| Event | Payload | Description |
|-------|---------|-------------|
| `connected` | - | WebSocket connection established |
| `disconnected` | - | WebSocket connection closed |
| `error` | `string` | Error message |

## Exposed Methods

```vue
<script setup>
const visualizer = ref()

// Manually control connection
visualizer.value.connect()
visualizer.value.disconnect()

// Check connection state
console.log(visualizer.value.isConnected)
</script>

<template>
  <FFTVisualizer ref="visualizer" websocket-url="..." />
</template>
```

---

## WebSocket Protocol

The component expects a WebSocket server that implements the following protocol:

### 1. Connection

Client connects to the specified `websocketUrl`. The server should accept the connection and begin streaming.

### 2. Configuration Message (JSON)

Server sends a JSON configuration message immediately after connection:

```json
{
  "type": "config",
  "mode": "fft",
  "bins": 80,
  "fps": 120
}
```

| Field | Type | Description |
|-------|------|-------------|
| `type` | `string` | Must be `"config"` |
| `mode` | `string` | Must be `"fft"` |
| `bins` | `number` | Number of frequency bins in the data (typically 80) |
| `fps` | `number` | Target frames per second (informational) |

### 3. Binary FFT Data

After the config message, server continuously sends binary frames:

- **Format**: Raw bytes, one `uint8` (0-255) per frequency bin
- **Length**: Must match `bins` from config (e.g., 80 bytes)
- **Value mapping**: 0 = silence, 255 = maximum amplitude
- **Frequency range**: Typically 100Hz to 18kHz, exponentially spaced

Example: 80 bytes representing frequency magnitudes from low to high.

### 4. Recommended FFT Processing

For best results, the server should:

1. **Capture audio** at 48kHz or higher
2. **Apply window function** (Hann/Hamming) to reduce spectral leakage
3. **Compute FFT** (1024-2048 samples recommended)
4. **Map to frequency bands** using exponential spacing (100Hz - 18kHz)
5. **Apply A-weighting** to match human hearing perception
6. **Convert to dB scale** and normalize to 0-255 range
7. **Stream at 60-120fps** for smooth visualization

---

## Backend Examples

See the `/backend-examples` directory for reference implementations:

- **[Python](./backend-examples/python/)** - Using pyalsaaudio and numpy
- **[Node.js](./backend-examples/nodejs/)** - Using node-audiorecorder and fft.js
- **[Rust](./backend-examples/rust/)** - Using cpal and rustfft

Each example captures system audio, computes FFT, and streams to WebSocket clients.

---

## Development

```bash
# Install dependencies
pnpm install

# Run dev server
pnpm dev

# Build library
pnpm build

# Type check
pnpm typecheck
```

## How It Works

1. **WebSocket Connection**: Component connects to your server and receives FFT data
2. **Data Processing**: Aggregates server bins to display bands, tracks peaks
3. **WebGL Rendering**: Fragment shader renders bars with gradient, LED effect, and peaks
4. **Animation Loop**: `requestAnimationFrame` drives smooth 120fps rendering

## Browser Support

Requires WebGL support (all modern browsers):
- Chrome 56+
- Firefox 51+
- Safari 15+
- Edge 79+

## License

MIT © Wouter Vernaillen
