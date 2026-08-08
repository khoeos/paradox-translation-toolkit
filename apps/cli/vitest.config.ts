import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    // Colocated, like apps/desktop.
    include: ['src/**/*.test.ts'],
    environment: 'node'
  }
})
