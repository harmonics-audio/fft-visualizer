import { defineConfig } from 'vite'
import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'
import { radioDevProxy } from '@fft-visualizer/playground-shared/radioDevProxy'
import { resolve } from 'path'

export default defineConfig({
  // Each playground builds at the subpath it will be served from, so the
  // assembled switcher site works behind any plain static server.
  base: '/react/',
  resolve: {
    alias: {
      // Deliberately overrides the workspace links, which would resolve both
      // packages to their `dist` bundles: the playground then needs no prior
      // `pnpm build`, and edits to the wrapper or the engine show up on save.
      // The import specifiers stay the published ones, so the code still reads
      // as real usage.
      //
      // The subpath comes first: alias keys match by prefix, so the bare entry
      // alone would rewrite '@fft-visualizer/core/wasm' to 'src/index.ts/wasm'.
      '@fft-visualizer/core/wasm': resolve(__dirname, '../../packages/core/src/wasm.ts'),
      '@fft-visualizer/react': resolve(__dirname, '../../packages/react/src/index.ts'),
      '@fft-visualizer/core': resolve(__dirname, '../../packages/core/src/index.ts')
    }
  },
  // No @vitejs/plugin-react: Vite's esbuild already compiles .tsx with the
  // automatic JSX runtime from tsconfig's `"jsx": "react-jsx"`, same as the
  // react package's own build. The only thing given up is Fast Refresh — an
  // edit reloads the page instead of preserving component state.
  //
  // radioDevProxy answers /api/radio in dev and preview, the same path nginx
  // serves in production — see playground/shared/radioStream.ts.
  plugins: [radioDevProxy(), wasm(), topLevelAwait()],
  build: {
    // The WASM glue emits top-level await; esnext keeps
    // vite-plugin-top-level-await clear of esbuild's down-level pass.
    target: 'esnext'
  }
})
