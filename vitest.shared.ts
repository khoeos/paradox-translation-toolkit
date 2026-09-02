import { defineConfig } from 'vitest/config'
import type { ViteUserConfig } from 'vitest/config'

export interface LibraryTestOptions {
  branches?: number
}

const DEFAULT_BRANCHES = 80
const LINES_FUNCTIONS_STATEMENTS = 90

export function libraryVitestConfig(options: LibraryTestOptions = {}): ViteUserConfig {
  return defineConfig({
    resolve: { tsconfigPaths: true },
    test: {
      include: ['test/**/*.test.ts'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'lcov'],
        include: ['src/**/*.ts'],
        exclude: ['src/types.ts', 'src/index.ts'],
        thresholds: {
          lines: LINES_FUNCTIONS_STATEMENTS,
          functions: LINES_FUNCTIONS_STATEMENTS,
          statements: LINES_FUNCTIONS_STATEMENTS,
          branches: options.branches ?? DEFAULT_BRANCHES
        }
      }
    }
  })
}
