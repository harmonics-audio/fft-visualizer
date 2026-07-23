import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'
import { playwright } from '@vitest/browser-playwright'

export default defineConfig({
  // The component drives the WebGL core, so its tests need a real browser
  // (Chromium via Playwright) for a genuine GPU context and canvas behavior.
  plugins: [vue(), wasm(), topLevelAwait()],
  resolve: {
    alias: {
      'fft-visualizer-core': new URL('../core/src/index.ts', import.meta.url).pathname,
      'fft-visualizer-core/wasm': new URL('../core/src/wasm.ts', import.meta.url).pathname
    }
  },
  test: {
    name: 'vue-browser',
    include: ['src/**/*.browser.test.ts'],
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      instances: [{ browser: 'chromium' }]
    }
  }
})
