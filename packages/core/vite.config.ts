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
    lib: {
      entry: {
        'fft-visualizer-core': resolve(__dirname, 'src/index.ts'),
        'fft-wasm': resolve(__dirname, 'src/wasm.ts'),
      },
      formats: ['es'] as const
    }
  }
})
