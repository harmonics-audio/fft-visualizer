import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'
import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'
import { resolve } from 'path'

export default defineConfig({
  plugins: [
    wasm(),
    topLevelAwait(),
    dts({
      insertTypesEntry: true,
      include: ['src/**/*.ts', 'wasm/pkg/*.d.ts'],
      exclude: ['src/**/*.test.ts']
    })
  ],
  build: {
    // The WASM glue and vite-plugin-top-level-await emit top-level await; keep
    // the output at esnext so vite-plugin-top-level-await skips esbuild's
    // down-level pass (which can't lower the TLA-wrapped destructuring to
    // Vite's default es2020 target).
    target: 'esnext',
    lib: {
      entry: {
        'fft-visualizer-core': resolve(__dirname, 'src/index.ts'),
        'fft-wasm': resolve(__dirname, 'src/wasm.ts'),
      },
      formats: ['es'] as const
    }
  }
})
