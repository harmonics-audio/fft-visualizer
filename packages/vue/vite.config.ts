import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import dts from 'vite-plugin-dts'
import { resolve } from 'path'

export default defineConfig({
  plugins: [
    vue(),
    dts({
      // A build-only tsconfig that drops the `@fft-visualizer/core` → source
      // `paths` mapping, so declarations resolve core from its built package
      // (bare `@fft-visualizer/core` import) instead of leaking `../../core/src`
      // paths that don't exist in the published tarball.
      tsconfigPath: resolve(__dirname, 'tsconfig.build.json'),
      insertTypesEntry: true,
      include: ['src/**/*.ts', 'src/**/*.vue'],
      exclude: ['src/**/*.test.ts']
    })
  ],
  build: {
    lib: {
      entry: {
        'fft-visualizer-vue': resolve(__dirname, 'src/index.ts'),
        'fft-wasm': resolve(__dirname, 'src/wasm.ts'),
      },
      formats: ['es'] as const,
      // Pinned, because with an entry map Vite derives the stylesheet name
      // from the package name — and `@fft-visualizer/vue` collapses to
      // `vue.css`, which the `./style.css` export doesn't point at.
      cssFileName: 'fft-visualizer-vue'
    },
    rollupOptions: {
      // core + wasm ship in @fft-visualizer/core (a runtime dependency);
      // vue is the consumer's peer. Keep both out of the bundle.
      external: ['vue', '@fft-visualizer/core', '@fft-visualizer/core/wasm'],
      output: {
        globals: { vue: 'Vue' }
      }
    }
  }
})
