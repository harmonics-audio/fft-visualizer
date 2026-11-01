import { defineConfig } from 'vite'
import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'
import { radioDevProxy } from '@fft-visualizer/playground-shared/radioDevProxy'
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
      //
      // The subpath comes first: alias keys match by prefix, so the bare entry
      // alone would rewrite '@fft-visualizer/core/wasm' to 'src/index.ts/wasm'.
      '@fft-visualizer/core/wasm': resolve(import.meta.dirname, '../../packages/core/src/wasm.ts'),
      '@fft-visualizer/core': resolve(import.meta.dirname, '../../packages/core/src/index.ts')
    }
  },
  // radioDevProxy answers /api/radio in dev and preview, the same path nginx
  // serves in production — see playground/shared/radioStream.ts.
  plugins: [radioDevProxy(), wasm(), topLevelAwait()],
  build: {
    // The WASM glue emits top-level await; esnext keeps
    // vite-plugin-top-level-await clear of esbuild's down-level pass.
    target: 'esnext'
  }
})
