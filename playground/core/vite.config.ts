import { defineConfig } from 'vite'
import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'
import { resolve } from 'path'

export default defineConfig({
  // Each playground builds at the subpath it will be served from, so the
  // assembled switcher site works behind any plain static server.
  base: '/core/',
  resolve: {
    alias: {
      // Deliberately overrides the workspace link, which would resolve core to
      // its `dist` bundle: the playground then needs no prior `pnpm build`, and
      // edits to the engine show up on save. The import specifier stays the
      // published one, so the code still reads as real usage.
      '@fft-visualizer/core': resolve(__dirname, '../../packages/core/src/index.ts')
    }
  },
  plugins: [wasm(), topLevelAwait()],
  build: {
    // The WASM glue emits top-level await; esnext keeps
    // vite-plugin-top-level-await clear of esbuild's down-level pass.
    target: 'esnext'
  }
})
