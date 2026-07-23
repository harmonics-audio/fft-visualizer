import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Pure-logic tests — plain typed arrays, no DOM/WebGL needed
    name: 'core',
    environment: 'node',
    include: ['src/**/*.test.ts']
  }
})
