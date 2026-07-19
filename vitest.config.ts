import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Pure-logic tests use plain typed arrays — no DOM needed
    environment: 'node',
    include: ['src/**/*.test.ts']
  }
})
