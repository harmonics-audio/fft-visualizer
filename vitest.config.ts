import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import wasm from 'vite-plugin-wasm'
import { playwright } from '@vitest/browser-playwright'

export default defineConfig({
  test: {
    projects: [
      {
        // Fast pure-logic tests — plain typed arrays, no DOM
        test: {
          name: 'node',
          environment: 'node',
          include: ['src/**/*.test.ts'],
          exclude: ['src/**/*.browser.test.ts']
        }
      },
      {
        // Real-browser tests (Chromium via Playwright) for WebGL rendering,
        // canvas/DOM behavior, and anything needing a real GPU context.
        plugins: [vue(), wasm()],
        test: {
          name: 'browser',
          include: ['src/**/*.browser.test.ts'],
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: 'chromium' }]
          }
        }
      }
    ]
  }
})
