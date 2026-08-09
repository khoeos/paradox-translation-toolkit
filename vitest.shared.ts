import { defineConfig } from 'vitest/config'
import type { ViteUserConfig } from 'vitest/config'

/**
 * The one Vitest setup every library package uses.
 *
 * It existed as five near-identical `vitest.config.ts` files differing only in a single threshold
 * number, which is the per-package ceremony that makes a small package feel expensive. The cure is
 * one factory, not fewer packages.
 *
 * Note what these thresholds are NOT: a gate. Each package's `test` script is `vitest run` with no
 * `--coverage`, so CI never evaluates them. Check one deliberately with
 * `pnpm --filter @ptt/converter exec vitest run --coverage`.
 */
export interface LibraryTestOptions {
  /** Branch coverage floor. `@ptt/parser` holds a higher bar than the rest. */
  branches?: number
}

const DEFAULT_BRANCHES = 80
const LINES_FUNCTIONS_STATEMENTS = 90

export function libraryVitestConfig(options: LibraryTestOptions = {}): ViteUserConfig {
  return defineConfig({
    resolve: { tsconfigPaths: true },
    test: {
      // `test/` sibling of `src/`, which is the convention for packages/* and games/*.
      // apps/* colocate instead and keep their own config.
      include: ['test/**/*.test.ts'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'lcov'],
        include: ['src/**/*.ts'],
        // Type declarations and the barrel carry no behaviour to cover.
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
