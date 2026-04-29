# Testing

All tests run via `pnpm test`. Per-package coverage is enforced via Vitest thresholds where applicable (`parser-core` ≥ 90%, `converter-core` ≥ 90%).

## What's covered

- **`parser-core`**: BOM, escapes, color codes, comments, error recovery, multi-line values, line-ending preservation, body/comment ordering, full round-trip fuzz.
- **`converter-core`**: scan with mixed layouts, diff against override subdirs, plan for both modes (incl. basename-collision refusal), idempotent apply, atomic write order (tmp → backup → rename), fake `FsLike`.
- **`game-*`**: smoke tests for each `GameDefinition`.
- **`game-registry`**: extensibility test (adding a new game without touching core).
- **`@ptt/desktop`**:
  `path-policy.test.ts` covers the Paradox-pattern allowlist and the critical-folder blocklist for Win / macOS / Linux. OS-specific cases run only on the matching host (POSIX path semantics can't be faked on Win32 without mocking `node:path`).
- **`i18n`**: parity check: every non-plural English key must exist in every other locale.

## Running tests

```bash
pnpm test                                          # all packages
pnpm --filter @ptt/parser-core test                # single package
pnpm --filter @ptt/parser-core test -- --watch     # watch mode
pnpm --filter @ptt/parser-core test -- --coverage  # with coverage report
```

## i18n extraction gate

CI runs `pnpm --filter @ptt/i18n run extract:check`, which invokes `i18next-cli extract --ci`. A PR introducing a new `t('foo.bar')` call without updating the locale JSONs fails the build.

To fix locally:

```bash
pnpm --filter @ptt/i18n run extract  # appends missing keys with empty values
```

Existing translations are never overwritten (see `packages/i18n/i18next.config.ts`).

## What's missing

There is **no E2E yet** for the desktop app or tests on real `.yml` files. Playwright + Electron is on the [roadmap](./roadmap.md). The renderer (hooks, stores, components) is also not unit-tested today; that should land before the editor work begins.

## Writing new tests

- Use Vitest's `describe` / `it` style, matching the existing files in each package.
- Tests live next to the code they cover. Most packages keep tests under `test/` ; the desktop app uses `*.test.ts` colocated with the source.
- For anything FS-related in `converter-core`, use the in-memory `FsLike` fake (`packages/converter-core/test/memory-fs.ts`) rather than touching the real disk.
- For new game support, add a smoke test in the new `@ptt/game-<id>` package mirroring the existing ones.
- For platform-conditional tests (path policy, OS-specific behaviour), use Vitest's `describe.runIf(process.platform === '…')` rather than mocking `process.platform`. `node:path` semantics depend on the actual host OS and don't follow the mock.
