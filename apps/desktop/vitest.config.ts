import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    // Pure-Node tests for main-process modules. Renderer tests (jsdom) will
    // need a separate project entry the day we add them.
    include: ['src/**/*.test.ts'],
    environment: 'node'
  }
})
