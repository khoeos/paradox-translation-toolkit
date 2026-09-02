# Testing

All tests run via `pnpm test`. Coverage thresholds live once, in `vitest.shared.ts` at the repo root (lines / functions / statements ≥ 90, branches ≥ 80, or 85 for `parser`); each library's `vitest.config.ts` is a two-line call to `libraryVitestConfig()`. They are **not** a gate: `test` is `vitest run` with no `--coverage`, so CI never evaluates them. Check one with:

```bash
pnpm --filter @ptt/converter exec vitest run --coverage
```

## What's covered

- **`parser`**: BOM, escapes, color codes, comments, error recovery, multi-line values, line-ending preservation, body/comment ordering, full round-trip fuzz.
- **`converter`**: the mod-level pipeline, over a fake `FsLike`: multi-mod discovery, descriptor reading, inter-mod coverage by declared dependency and by key overlap, the key-level diff and its six `KeyState` (including the `english` versus `kept` boundary, which only the translation memory can settle), generated-mod idempotence, namespace pruning and its guards, the sandbox and file-size guards carried on every write, and the job-event guard.
- **`translate`**: the engine's six guarantees against a table-driven provider (glossary and memory bypass, in-flight deduplication across mods, recursive batch splitting, the circuit breaker, the markup gate, refusal clearing), the three providers against a scripted `fetch`, atomic memory flush, and the glossary's term voting.
- **`report`**: CSV quoting and formula neutralisation, the stored report shape, and its zod schema refusing a truncated or hand-edited report.
- **`fs-node`**: the adapter against a real temporary directory, including a BOM + CRLF round trip. A fake here would test nothing.
- **`@ptt/cli`**: argv parsing with its documented quirks, flag coercion, the config file, option building against the registry and the zod schemas, the per-platform userData mapping, mod filtering and terminal formatting.
- **`@ptt/games`**: registry invariants (`getAllGames`, `getGame`, `getAllGameIds`, `toGameSummary`, `getGameSummaries`) plus a table-driven test in `packages/games/test/games.test.ts` with one row per `GameDefinition`, asserting id, displayName, steamAppId, localisationDirName, layout, userFolder and the game-specific language tokens.
- **`@ptt/desktop`**: `path-policy.test.ts` covers the Paradox-pattern allowlist and the critical-folder blocklist for Win / macOS / Linux. OS-specific cases run only on the matching host (POSIX path semantics can't be faked on Win32 without mocking `node:path`). `generated-mod-paths.test.ts` covers where the generated mod lands per game. `store/converter-form.test.ts` covers scan invalidation, provider switching and the API key never reaching the persisted settings. `store/job-status-i18n.test.ts` asserts every `JobStatus` has a label, because the modal builds that key dynamically and the extractor cannot see it. `lib/estimate.test.ts` covers the duration estimate.
- **`i18n`**: parity check: every non-plural English key must exist in every other locale.

## Running tests

```bash
pnpm test                                          # all packages
pnpm --filter @ptt/parser test                     # single package
pnpm --filter @ptt/parser test -- --watch          # watch mode
pnpm --filter @ptt/parser test -- --coverage       # with coverage report
```

## i18n extraction gate

CI runs `pnpm --filter @ptt/i18n run extract:check`, which invokes `i18next-cli extract --ci`. A PR introducing a new `t('foo.bar')` call without updating the locale JSONs fails the build.

To fix locally:

```bash
pnpm --filter @ptt/i18n run extract  # appends missing keys with empty values
```

Existing translations are never overwritten (see `packages/i18n/i18next.config.ts`).

## What's missing

There is **no E2E yet** for the desktop app. Playwright + Electron is on the [roadmap](./roadmap.md).

**Renderer components are not tested.** `apps/desktop/vitest.config.ts` runs in `environment: 'node'`, so anything that renders JSX has nowhere to render. The stores, the hooks' pure helpers and the formatting logic are covered; `ModList`, `TranslateSettings`, `RunButton` and `ProgressModal` are not. Closing that needs a DOM environment and a rendering library, which are not installed:

```bash
pnpm add -D -w jsdom @testing-library/react @testing-library/jest-dom
```

Then give `apps/desktop` a second Vitest project entry with `environment: 'jsdom'` and an `include` of `src/renderer/**/*.test.tsx`, leaving the Node project for `src/main/**`. Until then, keep renderer logic in stores and `lib/` modules where it can be tested, which is why the duration estimate lives in `lib/estimate.ts` rather than inside the modal.

## Writing new tests

- Use Vitest's `describe` / `it` style, matching the existing files in each package.
- Tests live next to the code they cover. Most packages keep tests under `test/` ; the desktop app uses `*.test.ts` colocated with the source.
- For anything FS-related, use the in-memory `FsLike` fake rather than touching the real disk. It is exported for other packages as `@ptt/converter/test/memory-fs`; `translate` and `report` both use it.
- For anything network-related, pass a scripted `FetchLike` rather than mocking a global. `packages/translate/test/fake-fetch.ts` is the pattern.
- `@ptt/fs-node` is the one exception: it is the seam to the real filesystem, so its tests use a real `mkdtemp` directory.
- For new game support, add a row to the table in `packages/games/test/games.test.ts`.
- For platform-conditional tests (path policy, OS-specific behaviour), use Vitest's `describe.runIf(process.platform === '…')` rather than mocking `process.platform`. `node:path` semantics depend on the actual host OS and don't follow the mock.
