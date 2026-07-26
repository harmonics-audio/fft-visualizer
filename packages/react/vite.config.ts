import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'
import { resolve } from 'path'

// No @vitejs/plugin-react here on purpose: this package has no dev server or
// playground, and Vite's esbuild already compiles .tsx with the automatic JSX
// runtime from tsconfig's `"jsx": "react-jsx"`.
export default defineConfig({
  plugins: [
    dts({
      // A build-only tsconfig that drops the `fft-visualizer-core` → source
      // `paths` mapping, so declarations resolve core from its built package
      // (bare `fft-visualizer-core` import) instead of leaking `../../core/src`
      // paths that don't exist in the published tarball.
      tsconfigPath: resolve(__dirname, 'tsconfig.build.json'),
      insertTypesEntry: true,
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['src/**/*.test.ts', 'src/**/*.test.tsx']
    })
  ],
  build: {
    lib: {
      entry: {
        'fft-visualizer-react': resolve(__dirname, 'src/index.ts'),
        'fft-wasm': resolve(__dirname, 'src/wasm.ts')
      },
      formats: ['es'] as const
    },
    rollupOptions: {
      // core + wasm ship in fft-visualizer-core (a runtime dependency); react and
      // its JSX runtime are the consumer's peer. Keep all of them out of the bundle.
      external: ['react', 'react/jsx-runtime', 'fft-visualizer-core', 'fft-visualizer-core/wasm']
    }
  }
})
