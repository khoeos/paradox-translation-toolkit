# Testing

All tests run via `pnpm test`. Coverage thresholds live once, in `vitest.shared.ts` at the repo root (lines / functions / statements ≥ 90, branches ≥ 80, or 85 for `parser`); each library's `vitest.config.ts` is a two-line call to `libraryVitestConfig()`. They are **not** a gate: `test` is `vitest run` with no `--coverage`, so CI never evaluates them. Check one with:

```bash
pnpm --filter @ptt/converter exec vitest run --coverage
```

## What's covered

- **`parser`**: BOM, escapes, color codes, comments, error recovery, multi-line values, line-ending preservation, body/comment ordering, full round-trip fuzz.
- **`converter`**: the mod-level pipeline, over a fake `FsLike`: multi-mod discovery, descriptor reading, inter-mod coverage by declared dependency and by key overlap, the key-level diff and its six `KeyState` (including the `english` versus `kept` boundary, which only the translation memory can settle), generated-mod idempotence, namespace pruning and its guards, the sandbox and file-size guards carried on every write, and the job-event guard. `test/run.test.ts` also covers the sequence `runConvert` owns around the pipeline, with fake `TranslationSetupPort` / `RunReportPort`: glossary problems emitted before the first mod, memory flushed before the report is written, both still happening on a cancelled run, and `output.reportPath` set only when the port actually wrote something. `test/scan-mods.test.ts` covers the options that must reach the key plan, `targetContent` and `retranslateOwnKeys`, including the mode where the latter is dropped.

- **`translate`**: the engine's six guarantees against a table-driven provider (glossary and memory bypass, in-flight deduplication across mods, recursive batch splitting, the circuit breaker, the markup gate, refusal clearing), the three providers against a scripted `fetch`, atomic memory flush, and the glossary's term voting.
- **`shared`**: `test/languages.test.ts` covers the language recognizer and its normalization (codes, display names, the two Paradox token aliases), the label grammar, the two token predicates and their normalized-input precondition, every `findTargetListProblem` code, the `findTargetListIssue` ordering (shape before provider before mode) and a non-empty message for every `TargetListProblem` code, plus `TranslationTargetSchema`. `test/updater.test.ts` covers `isUpdaterEvent` against the `UPDATER_EVENT_TYPES` tuple, including that the union and the tuple stay in step.

- **`report`**: CSV quoting and formula neutralisation, the stored report shape, and its zod schema refusing a truncated or hand-edited report.
- **`fs-node`**: the adapter against a real temporary directory, including a BOM + CRLF round trip. A fake here would test nothing.
- **`@ptt/cli`**: argv parsing with its documented quirks, flag coercion, the config file, option building against the registry and the zod schemas, the per-platform userData mapping, mod filtering and terminal formatting.
- **`@ptt/games`**: registry invariants (`getAllGames`, `getGame`, `getAllGameIds`, `toGameSummary`, `getGameSummaries`) plus a table-driven test in `packages/games/test/games.test.ts` with one row per `GameDefinition`, asserting id, displayName, steamAppId, localisationDirName, layout, userFolder and the game-specific language tokens.
- **`@ptt/desktop`**: `workers/ports.test.ts` and `@ptt/cli`'s `commands/ports.test.ts` cover the two port adapters each front end supplies to `runConvert` (the sequence itself is tested once, in `converter`). `ipc/procedures/converter.test.ts` asserts the scan and convert schemas accept exactly the same target lists. `store/jobs.test.ts` covers the job reducer: eviction that spares the active job, auto-creation on an unknown job id, the `scan-phase` dedup that returns the same state object so nothing re-renders, and the deferred clear on fake timers. `lib/run-errors.test.ts` ends with a contract test that drives the real `scanMods` over a `MemoryFs`, because its regexes are written against sentences owned by `@ptt/parser`: frozen string constants would stay green through a rewording. `path-policy.test.ts` covers the Paradox-pattern allowlist

and the critical-folder blocklist for Win / macOS / Linux. OS-specific cases run only on the matching host (POSIX path semantics can't be faked on Win32 without mocking `node:path`). `generated-mod-paths.test.ts` covers where the generated mod lands per game. `store/converter-form.test.ts` covers scan invalidation, provider switching and the API key never reaching the persisted settings. `store/job-status-i18n.test.ts` asserts every `JobStatus` has a label, because the modal builds that key dynamically and the extractor cannot see it. `lib/mod-selection.test.ts` covers the key total shown above the mod list.

- **`i18n`**: parity check: every non-plural English key must exist in every other locale.

## Running tests

```bash
pnpm test                                          # all packages
pnpm --filter @ptt/parser test                     # single package
pnpm --filter @ptt/parser test -- --watch          # watch mode
pnpm --filter @ptt/parser test -- --coverage       # with coverage report
```

## E2E (Playwright + Electron)

`apps/desktop/e2e/` drives the **real Electron app** through Playwright's `_electron` API. It is
deliberately **not** part of `pnpm test`: `turbo run test` stays Vitest-only and CI does not run E2E
yet, so a flaky window never blocks a PR.

```bash
pnpm e2e                                  # builds the app (turbo-cached), then runs the suite
pnpm --filter @ptt/desktop exec playwright test      # already built, skip turbo
pnpm --filter @ptt/desktop run e2e:ui                # Playwright UI mode
```

- **Fixtures** live in `e2e/fixtures.ts`. `userDataDir` creates a throwaway `--user-data-dir`
  **before** anything starts, so `electron-store` settings and the window-state file never leak
  between tests or touch your real profile, and a test can write into it first. `launchApp()`
  starts the app on that directory and can be called twice, which is how
  `settings.test.ts` checks that a setting survives the process that wrote it. `electronApp` and
  `page` are the one-launch shorthands. A trace is recorded for every launch and written to
  `test-results/` only on failure; teardown tolerates an app the test closed itself.
- **Seeding** goes through `e2e/seed.ts`, which writes a run report with the production
  `writeRunReport`. The fixture therefore cannot drift from the schema the Runs page reads back.
  `runs.test.ts` uses it to cover the one path no Vitest suite reaches: the report on disk, through
  `RunReportsService` and tRPC, into the history table and the detail route.

- **`PTT_E2E=1`** is set by the fixture and read in `main/env.ts`. It suppresses the two things that
  make an unpackaged run non-deterministic: the detached DevTools window (which would otherwise count
  as a second window) and the auto-update check.
- **File naming**: E2E files are `e2e/**/*.test.ts`, the repo-wide convention. They can't collide
  with Vitest because `apps/desktop/vitest.config.ts` pins `include: ['src/**/*.test.ts']` and
  `playwright.config.ts` pins `testDir: './e2e'`.
- **Typecheck and lint** cover them: `tsconfig.e2e.json` is the third project in the app's
  `typecheck` script, and the `lint` script is `oxlint src e2e`.
- `workers: 1`, `fullyParallel: false`: each test boots its own Electron instance, and several at
  once fight over the singleton lock and the screen.

## Driving the app from Claude (MCP)

`.mcp.json` declares a `playwright-electron` server: `@playwright/mcp` pointed at a CDP endpoint
rather than launching its own Chromium. Start the app with remote debugging on, then the MCP tools
(`browser_snapshot`, `browser_click`, ...) act on the live renderer:

```bash
pnpm --filter @ptt/desktop run dev:debug   # electron-vite dev -w --remoteDebuggingPort=9222
```

`main/env.ts` also reads `REMOTE_DEBUGGING_PORT` (set by electron-vite) to keep DevTools closed, so
the CDP endpoint exposes exactly one page target: the app window. Without that guard the DevTools
window shows up as a second target and the MCP can attach to the wrong one.

Scope: this is the **renderer** only. The main process is not reachable this way, and neither is
anything behind a native dialog. For main-process assertions use `electronApp.evaluate()` in an
E2E test instead.

## i18n extraction gate

CI runs `pnpm --filter @ptt/i18n run extract:check`, which invokes `i18next-cli extract --ci`. A PR introducing a new `t('foo.bar')` call without updating the locale JSONs fails the build.

To fix locally:

```bash
pnpm --filter @ptt/i18n run extract  # appends missing keys with empty values
```

Existing translations are never overwritten (see `packages/i18n/i18next.config.ts`).

## What's missing

**Renderer components are not tested.** `apps/desktop/vitest.config.ts` runs in `environment: 'node'`, so anything that renders JSX has nowhere to render. The stores, the hooks' pure helpers and the formatting logic are covered; `ModList`, `TranslateSettings`, `RunButton` and `ProgressModal` are not. Closing that needs a DOM environment and a rendering library, which are not installed:

```bash
pnpm add -D -w jsdom @testing-library/react @testing-library/jest-dom
```

Then give `apps/desktop` a second Vitest project entry with `environment: 'jsdom'` and an `include` of `src/renderer/**/*.test.tsx`, leaving the Node project for `src/main/**`. Until then, keep renderer logic in stores and `lib/` modules where it can be tested, which is why the selected-key total lives in `lib/mod-selection.ts` rather than inside `ModList`.

## Writing new tests

- Use Vitest's `describe` / `it` style, matching the existing files in each package.
- Tests live next to the code they cover. Most packages keep tests under `test/` ; the desktop app uses `*.test.ts` colocated with the source.
- For anything FS-related, use the in-memory `FsLike` fake rather than touching the real disk. It is exported for other packages as `@ptt/converter/test/memory-fs`; `translate` and `report` both use it.
- For anything network-related, pass a scripted `FetchLike` rather than mocking a global. `packages/translate/test/fake-fetch.ts` is the pattern.
- `@ptt/fs-node` is the one exception: it is the seam to the real filesystem, so its tests use a real `mkdtemp` directory.
- For new game support, add a row to the table in `packages/games/test/games.test.ts`.
- For platform-conditional tests (path policy, OS-specific behaviour), use Vitest's `describe.runIf(process.platform === '…')` rather than mocking `process.platform`. `node:path` semantics depend on the actual host OS and don't follow the mock.
