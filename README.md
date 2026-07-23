# FFT Visualizer

A high-performance, WebGL-based **real-time audio spectrum analyzer** and FFT
visualizer. The entire visual — bars, LED segments, radial layout, gradient,
glow, reflection — is drawn by a single fragment shader in one GPU draw call, so
it stays smooth even at 120 fps with 80 bands in stereo.

This is a monorepo. The rendering engine lives in a framework-agnostic core
package; framework integrations are thin wrappers around it.

## Packages

| Package | Description | |
|---------|-------------|--|
| [`fft-visualizer-core`](./packages/core) | Framework-agnostic WebGL renderer + audio/WebSocket engines as a vanilla TypeScript class. Zero framework dependencies. | `packages/core` |
| [`fft-visualizer-vue`](./packages/vue) | Vue 3 component wrapping the core. One peer dependency: Vue 3. | `packages/vue` |

The core owns all rendering, audio capture (mic / tab / system via the Web Audio
API + a lazy-loaded Rust/WASM FFT), WebSocket streaming, and the WebGL draw. Each
framework package is a thin adapter that maps its own reactivity/props onto the
core's imperative API.

## Which package do I want?

- **Using Vue?** Install [`fft-visualizer-vue`](./packages/vue) — see its README
  for props, modes, and examples.
- **Vanilla JS/TS, or another framework?** Use
  [`fft-visualizer-core`](./packages/core) directly:

  ```ts
  import { FFTVisualizer } from 'fft-visualizer-core'

  const viz = new FFTVisualizer(canvas, { mode: 'local', bands: 40, gradient: 'aurora' })
  // ...later
  viz.destroy()
  ```

## Data modes

The renderer has one job — draw a spectrum — and three ways to get the data:

| Mode | How data arrives | Use when |
|------|------------------|----------|
| `local` | Captures mic or display audio and computes the FFT in-browser (Rust/WASM) | You want a zero-backend, client-side visualizer |
| `websocket` *(default)* | Connects to a URL and reads **pre-computed** FFT frames | A server/device already produces FFT data (e.g. a Raspberry Pi) |
| `external` | You feed FFT magnitudes in yourself | You have your own audio pipeline |

Reference servers that stream FFT frames over WebSocket (Python, Node.js, Rust)
are in [`backend-examples/`](./backend-examples).

## Repository layout

```
packages/
  core/                 # fft-visualizer-core — vanilla renderer + engines
    src/                #   FFTVisualizer class, localAudio, webSocketFft, gradients, processing
    wasm/               #   Rust FFT processor (wasm-pack, bundler target; pkg/ is committed)
  vue/                  # fft-visualizer-vue — Vue 3 wrapper + playground demo
    src/                #   FFTVisualizer.vue, composables
    playground/         #   dev/demo app (deployed to Vercel)
backend-examples/       # reference WebSocket FFT servers (python / nodejs / rust)
```

## Development

Uses [pnpm](https://pnpm.io) workspaces.

```bash
pnpm install            # install all workspace deps

pnpm dev                # run the Vue playground demo
pnpm build              # build every package (pnpm -r build)
pnpm typecheck          # typecheck every package
pnpm test               # run all tests (core: node, vue: browser via Playwright)
pnpm lint:fix           # ESLint with auto-fix

pnpm build:wasm         # rebuild the Rust WASM FFT (requires the Rust toolchain + wasm-pack)
pnpm build:playground   # build the demo app (what Vercel deploys)
```

The committed `packages/core/wasm/pkg/` artifacts mean a normal build needs no
Rust toolchain — only `pnpm build:wasm` does.

## License

[MIT](./LICENSE) © Wouter Vernaillen
