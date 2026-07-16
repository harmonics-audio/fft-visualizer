import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import dts from 'vite-plugin-dts'
import wasm from 'vite-plugin-wasm'
import { resolve } from 'path'

export default defineConfig(({ mode }) => ({
  plugins: [
    vue(),
    wasm(),
    ...(mode !== 'playground' ? [dts({
      insertTypesEntry: true,
      include: ['src/**/*.ts', 'src/**/*.vue', 'wasm/pkg/*.d.ts']
    })] : [])
  ],
  build: mode === 'playground'
    ? {}
    : {
        lib: {
          entry: {
            'vue-fft-visualizer': resolve(__dirname, 'src/index.ts'),
            'fft-wasm': resolve(__dirname, 'src/wasm.ts'),
          },
          formats: ['es'] as const
        },
        rollupOptions: {
          external: ['vue'],
          output: {
            globals: {
              vue: 'Vue'
            }
          }
        }
      }
}))
