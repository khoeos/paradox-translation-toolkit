# Paradox Translation Toolkit

Turbo + pnpm monorepo : Electron app (`apps/desktop`) + developer CLI (`apps/cli`) +
FS-agnostic cores (`packages/`) + one `packages/games` package holding every game definition and the registry.

## Read docs/ first, by task

- Architecture and responsibilities : `docs/architecture.md`, section
  "Invariants worth preserving" (canonical, with two stale bullets : cross-boundary
  types are NOT all in `@ptt/shared`, see the duplications below)
- Add a game : `docs/game-support.md` (add `packages/games/src/<id>.ts`)
- Add a UI language : `docs/ui-language.md` (CLDR plural variants trap)
- Release, changesets, beta channel : `docs/publishing.md`
- Local installers : `docs/building.md` (dist-deploy workaround for pnpm)
- Test conventions : `docs/testing.md` ; deliberate product limitations :
  `docs/known-issues.md`

## Invariants (violable silently : watch these)

- `packages/parser`, `packages/converter`, `packages/translate` and
  `packages/report` are FS-agnostic : no `node:fs`, no Electron imports. This is now
  enforced rather than asserted, by `no-restricted-imports` in `.oxlintrc.json`
  (`packages/**`, `packages/fs-node/**` excluded) plus `"types": []` on
  every one of them. It used to be enforced in half the packages it was claimed of : a
  `/// <reference types="node" />` in translate leaked node's globals through the import
  graph and a probe importing `node:fs` compiled clean in translate and report. The
  directive is now `/// <reference lib="dom" />` in `translate/src/http.ts` and in
  `translate/src/backoff.ts`, which gives those files the `AbortSignal`, `URL` and
  `setTimeout` VALUES they genuinely need without re-admitting
  `node:fs`, `process` and `Buffer`. It sits in the source, not in a tsconfig, on purpose :
  these packages point `main` at `./src`, so every consumer typechecks their raw `.ts`
  inside its own program, and the requirement has to travel with the file (that is why
  `report` briefly needed `"types": ["node"]` for globals none of its own files use).
  The lint rule is still what catches a bare `import 'crypto'` or an `import 'electron'`,
  which no `types` setting can see.
- They reach the FS only through the injected `FsLike`, and the network only through the
  injected `FetchLike`. Both contracts live in `@ptt/shared` (`shared/src/ports.ts`), not
  in whichever package needed them first ; `FetchResponse.headers` is optional there on
  purpose, so the fakes and `nodeFetch` were not all forced to grow one when the backoff
  started reading `Retry-After`. In-memory FS fake at
  `converter/test/memory-fs.ts`, exported as `@ptt/converter/test/memory-fs`.
  `parser` is pure text and has no FS notion at all.
- Only `apps/desktop` may touch Electron. The real filesystem is reached through
  `@ptt/fs-node`, whose single `nodeFs` is imported by `apps/desktop` and `apps/cli` ; no
  other package imports `node:fs`.
- The preload's only cross-package import is `@ptt/shared/ipc-channels`, the
  zod-free subexport (the other import is `electron` itself). Anything reachable
  from the preload import graph ships in the preload bundle.
- The mod-level pipeline (`scanMods`, `runConvert`) lives in `converter` and takes a
  `ProgressPort` : `apps/desktop`'s worker and `apps/cli` call the same functions, which is
  what stops the two drifting. Everything *around* the pipeline is shared the same way, through
  two more injected ports declared in `converter/src/types.ts` : `TranslationSetupPort` (opens the
  memory and the engine, reports glossary problems, flushes) and `RunReportPort` (writes the run
  report). `runConvert` owns the order those steps run in ; each front end only supplies the
  wiring, in `apps/desktop/src/main/workers/ports.ts` and `apps/cli/src/commands/ports.ts`.
  That is why `converter -> translate` and `converter -> report` stay absent. The two front ends
  used to each write that ~60-line sequence themselves, with independently drifting spread guards.
  A new optional field on the report belongs in **both** adapters or in neither : the rule in force
  is that `retranslateOwnKeys` is recorded only when on.

- The renderer value-imports only zod-free subexports : `@ptt/converter/progress` for
  `JobEvent` / `isJobEvent`, `@ptt/converter/totals`, `@ptt/converter/path` for the `posix*`
  helpers, `@ptt/converter/reasons` for `IDENTICAL_REASON`, `@ptt/shared/updater` for
  `UpdaterEvent` / `isUpdaterEvent`, `@ptt/translate/defaults` for the settings bounds and
  `REFUSAL_REASONS`.

 A value import of a package root pulls zod and the whole pipeline into the
  renderer bundle (check with
  `grep -c ZodError apps/desktop/out/renderer/assets/index-*.js` after a build).
  `@ptt/converter/retranslate` used to exist for the same reason and **has been removed** : the
  `retranslateOwnKeysHasNoEffect` guard was pushed down into `scanMods` (next to the one
  `runConvert` already applied), so neither front end computes it and nothing imported the
  subexport any more. `src/retranslate.ts` stays, imported relatively by `run.ts` and
  `scan-mods.ts`. Re-declare the subexport if a zod-free consumer ever needs the predicate again.

 `@ptt/report` has a single `.` export and is therefore
  type-imported only from the renderer ; a value import of it would pull zod in.
- `packages/games/src/index.ts` `builtInGames` order = UI tab order (`builtInGames` ->
  `getGameSummaries()` -> `games.list` -> `GameTabs`, no sort on the path). A new
  game also needs its tab image wired in `GameTabs.tsx`.
- parser round-trip guarantee : parse -> mutate -> serialize must not
  introduce diff noise (BOM, CRLF/LF per locale, escapes preserved).
- Coverage thresholds live once, in `vitest.shared.ts` at the root (lines/functions/statements
  90 ; branches 85 parser, 80 elsewhere) ; each library's `vitest.config.ts` is a two-line call
  to `libraryVitestConfig()`. They are NOT a gate : `test` is `vitest run` with no
  `--coverage`, so CI never evaluates them. Run
  `pnpm --filter @ptt/converter exec vitest run --coverage` to check. `converter` used to miss
  all four (statements 86.87, branches 77.87 against the 80 floor, functions 88.40, lines 89.07)
  because `run.ts` (`runConvert`, the orchestrator both front ends share, at 1.11%) had no test
  file at all. The custom-target work added `test/run.test.ts` (`runConvert` end to end),
  `test/target.test.ts` and `test/prune.test.ts`, and the LLM-reliability work added
  `test/mod-keys.test.ts` plus a `runConvert` suite covering job events, the identical-answer
  annotation and `retranslateOwnKeys`, so those percentages are stale. They are also
  currently **unmeasurable** : on Windows + vitest 5 the `--coverage` run completes but reports
  0% for every file (the v8 instrumentation never attaches), so it fails all four thresholds
  regardless of the tests. Fix the reporter before trusting any figure here.
  Every converter module now has a test file : `generated-mod-paths.test.ts` moved into
  `packages/converter/test/` when `apps/desktop`'s one-line re-export of it was deleted, which is
  why `converter` has `@ptt/games` as a devDependency (no cycle : `games` only depends on `shared`).

- `apps/desktop`'s vitest runs in `environment: 'node'`, so nothing that renders JSX is
  tested. Keep renderer logic in stores and `lib/` modules where it can be
  (`lib/estimate.ts` exists for that reason) ; see `docs/testing.md` for what a jsdom
  project would need.

## Type assertions

- `as` is allowed in the shapes below, and nothing lints it (`categories.style` is
  off in `.oxlintrc.json`), so the discipline is manual. Keep these three at zero :
  `as unknown as X`, `<X>expr`, `@ts-expect-error`.
- Try first, all verified to compile under `tsconfig.base.json` (TS 7, `strict` +
  `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`) : `in` narrowing
  (after `typeof v === 'object' && v !== null && 'id' in v`, `v.id` needs no
  assertion) ; `TUPLE.some(x => x === v)` rather than `TUPLE.includes(v)` ; zod
  `safeParse` when the value crosses a process boundary. `as const` is not an
  assertion here but the replacement (`LANGUAGE_CODES`, `VALID_UI_LANGUAGES` are
  `as const` tuples so `z.enum()` can derive the union).
- **Seven sites in `src`**, all of them in one of the legitimate shapes, and all worth
  re-checking before adding an eighth (`packages/ui` and tests excluded throughout) :
  - `converter/src/mod-keys.ts:20` : `lc as LanguageCode`, `Object.entries` key widening over
    a `LanguageCode`-keyed record. The only one of its kind left.
  - `renderer/src/lib/ipc-link.ts:36` and `main/ipc/bridge.ts:68` : the two raw-message casts
    on the process boundary. These are the ones zod should replace, see **Boundaries** below.
  - `renderer/src/hooks/useUiLanguageSync.ts:17` : reading one field off the settings payload
    coming back from the main process ; same boundary, same fix.
  - `renderer/src/lib/ipc-link.ts:72` (`TRPCClientError.from`), `main/ipc/bridge.ts:102`
    (`_def._config`), `main/services/settings-service.ts:407` (electron-store `Store.set`) :
    external types that are wrong or closed. These three stay.

  Verify the whole set with :
  `grep -rnE "\bas [A-Za-z_{(<]" packages apps --include=*.ts --include=*.tsx | grep -v dist-deploy | grep -v packages/ui/ | grep -v "as const" | grep -vE "/(test|e2e)/|\.test\.ts"`
  (it also matches prose containing " as "; the code lines are the ones listed above).
  `packages/i18n/src/index.ts` used to hold an eighth, `(VALID_UI_LANGUAGES as readonly
  string[]).includes(value)`, which is precisely what the `TUPLE.some(...)` rule above exists to
  replace ; it now uses `some`. Add a one-line reason at any site that is not self-evident.

  How the count got down here : the custom-target work widened `TranslationTarget.language` from
  `LanguageCode` to `string` and five `as LanguageCode` / `as keyof typeof` sites became
  unnecessary (`games/src/index.ts` now filters with the `isLanguageCode` guard ;
  `apply-generated.ts`, `run.ts`, `scan-mod.ts` and `cli/commands/shared.ts` index
  `string`-keyed records, which needs no cast). A sixth went with the updater types moving to
  `@ptt/shared` : `isUpdaterEvent` no longer does `value as { type?: unknown }`. Check the two
  families that used to dominate with :
  `grep -rn "as LanguageCode\|as keyof typeof" packages apps --include=*.ts --include=*.tsx | grep -v dist-deploy`
  (expect exactly `converter/src/mod-keys.ts:20`).

- Boundaries : `renderer -> main` is validated (`RequestSchema.safeParse` in
  `main/ipc/bridge.ts`), but `main -> renderer` and `main -> worker` are not
  (`renderer/src/lib/ipc-link.ts`, `main/workers/converter.worker.ts` cast raw
  messages). Use zod there rather than adding a third cast. `LanguageCode` is the
  most-asserted type and `LanguageCodeSchema` already exists in `@ptt/shared` :
  derive an `isLanguageCode` guard from it instead of `value as LanguageCode`.
- Non-null `!` is fine in tests (`writes[0]!` is the direct cost of
  `noUncheckedIndexedAccess`), avoid it in `src`.

## Reuse before writing

- `packages/ui` ships 21 shadcn primitives (`ls packages/ui/src/components/`), 2
  with no consumer yet (`dropdown-menu`, `toggle`).
 Import `@ptt/ui/components/<kebab-name>` (no root `.`
  export) and `cn` from `@ptt/ui/lib/utils`. A missing primitive is installed
  (shadcn MCP in `.mcp.json`, or `pnpm dlx shadcn add`), never pasted.
- Never hand-roll path strings : `@ptt/converter` exports `posixJoin`,
  `posixDirname`, `posixBasename`, `posixSplit`, `posixNormalize`,
  `posixNormalizeStrict` (throws on `.` / `..`) and `posixContains` (sandbox
  containment). They are also reachable as `@ptt/converter/path`, the zod-free subexport the
  renderer must use (`src/path.ts` has no import at all, so it is the safest one in the repo).
  The two long-standing bypasses are gone : `VirtualizedFileList.tsx` used to open-code
  `posixDirname` and `main/services/path-policy.ts` re-created `posixSplit` as `segmentsOf`
  next to the traversal guards.

- All `_l_<lang>.yml` text goes through `@ptt/parser` (`parse` / `serialize`),
  filenames through `parseFilename` / `buildFilename` ; the `_l_<lang>.yml` filename grammar lives in
  `parser/src/filename.ts` and nowhere else.
- UI strings : write `t('section.key')` (plain dotted keys, no namespaces), then
  `pnpm --filter @ptt/i18n run extract`. Never invent a key directly in
  `packages/i18n/src/locales/*.json`, only fill translated values ; CI runs
  `extract:check`. `useTranslation` comes from `react-i18next`, and outside
  components use `i18next.t` (as `renderer/src/store/jobs.ts` does).
- `JobEvent` and `isJobEvent` now live in `converter/src/progress.ts`, with a
  `JOB_EVENT_TYPES` tuple the guard checks against : a variant one side emits and the other
  does not handle is rejected rather than falling through a `switch`. `UpdaterStatus` +
  `UpdaterEvent` follow the same shape since : they live in `shared/src/updater.ts` with
  `UPDATER_STATUSES` / `UPDATER_EVENT_TYPES` tuples, `isUpdaterEvent` checks membership rather
  than `typeof type === 'string'`, and `UpdaterSnapshot` is the part of the main process's state
  the renderer hydrates from. Both sides re-export from there rather than redeclaring.
- Why a key came back untranslated is one vocabulary, assembled rather than retyped :
  `REFUSAL_REASONS` (`translate/src/types.ts`, an `as const` tuple so a consumer can iterate it)
  plus `IDENTICAL_REASON` and `NOT_ATTEMPTED_REASON` (`converter/src/reasons.ts`, the two the
  pipeline writes itself). The renderer's label map is
  `[...REFUSAL_REASONS, IDENTICAL_REASON] as const`, so a fifth engine reason is a compile error
  at the label map rather than a silent fall-through to the "unknown" wording. Only `identical` is
  ever labelled : `not attempted` reaches the CSV and the CLI table, never the UI.
- The whole acceptance decision for a target list is `findTargetListIssue`

  (`shared/src/languages.ts`) : shape, then the provider's own limits, then the modes that would
  write nothing. The three front ends (`renderer/src/lib/targets.ts`,
  `main/ipc/procedures/converter.ts`, `cli/src/options.ts`) each map the returned
  `TargetListProblem` code to their own wording and nothing else ; `describeTargetListProblem`
  owns the English one. Adding a check means adding a code, not a fourth copy of the sequence.
  `ScanModsInputSchema` and `ConvertInputSchema` run the same function, so a list the run would
  reject can no longer be scanned first.

- Where run reports live is `runReportsDir(userDataPath)` from `@ptt/report`, not
  `posixJoin(userDataPath, 'reports')` written out a fourth time.
- Internal deps are always `workspace:*` ; third-party deps shared by 2+ packages

  belong in the `catalog:` block of `pnpm-workspace.yaml`. Three shared deps are
  still pinned literally in both `apps/desktop` and `packages/ui` : `lucide-react`,
  `@types/react`, `@types/react-dom`. They happen to be in step today ; nothing keeps them so.

- `pnpm install` hits a private registry and can hang for minutes ; `pnpm install --offline`
  resolves everything already in the store instantly and is enough after adding a
  `workspace:*` dep or a catalog entry that is already in the lockfile.

## Boundaries and file placement

- `apps/desktop` has its own `CLAUDE.md` : renderer/main crossing, the worker-only
  pipeline, tRPC procedure placement, route registration, component conventions.
- `packages/ui` stays app-agnostic : no tRPC, no zustand, no i18next, no
  `@main`/`@renderer`, no `@ptt/*` other than itself.

## Naming, as it actually is

- Filename case is per-directory, there is no repo-wide convention.
  `renderer/src/components/**` : PascalCase matching the exported component (12/12).
  `renderer/src/hooks/**` : camelCase `useX.ts` (4/4). Every other file under
  `apps/desktop/src`, and every file in `packages/*/src` :
  lowercase or kebab, `packages/ui` included (kebab files exporting 89 PascalCase
  components). A `use*` export does not make the file camelCase : the stores are
  `store/converter-form.ts | jobs.ts | updater.ts`.
- Prefixes in use : `get`, `is` (predicates and type guards), `create`, `use`,
  `build`, `parse`, `format`, plus `has` and `ensure` in a couple of spots.
  `handle*` is only ever a local, non-exported handler ; `on*` only a prop or
  callback field. `should`, `compute`, `resolve` appear nowhere : prefer the
  existing verbs. Types and interfaces are PascalCase with no `I` / `T` prefix
  (65/65) ; recurring suffixes are `State`, `Options`, `Props`, `Event`.
- UPPER_SNAKE is for literal value constants, exported (`IPC_CHANNELS`,
  `LANGUAGE_CODES`, `UI_LANGUAGES`, `VALID_UI_LANGUAGES`, `DEFAULT_UI_LANGUAGE`) or
  module-local (`PROD_CSP`, `MAX_STORED_JOBS`, ...) ; singletons, routers and tRPC
  builders are camelCase (`nodeFs`, `dialogService`, `appRouter`, `*Router`).
  `packages/games/src/<id>.ts` must export a const named exactly `<id>`, because
  `src/index.ts` does `import { <id> } from './<id>.js'`.
- `...Schema` does not imply zod. Most `*Schema` identifiers are zod, but
  `SettingsSchema` (`main/services/settings-service.ts`) and `TranslationSchema`
  (`packages/i18n/src/index.ts`) are plain TS ; where the TS name was taken first the
  zod object got a `Zod` suffix as a one-off (`SettingsSchemaZod`). Do not
  generalize it : the healthy sibling pair is `SettingsPatch` / `SettingsPatchSchema`.
- Path aliases are declared as `@renderer/*`, `@main/*`, `@preload/*` but in practice
  only `@renderer/*` is used (161 imports, 3 for `@main`, none for `@preload`) ;

  inside `src/main` and in every `test/`, cross-directory relative imports are the
  norm, keep them. There is no `@/*` alias, yet `apps/desktop/components.json`
  advertises `@/components` : every app-level import the shadcn CLI writes has to be
  re-pointed to `@renderer/*`. Cross-package, import a declared `exports` subpath.
- Tests are always `*.test.ts` (no `.spec.`, no `__tests__/`) ; location is
  per-workspace : `packages/*` use a `test/` sibling of `src/`,
  `apps/desktop` and `apps/cli` colocate as `src/**/*.test.ts`. Every workspace with a
  `vitest.config.ts` pins an `include`, 10 of them : the eight `packages/*` libraries through
  `libraryVitestConfig()`'s `test/**/*.test.ts` (`game-locator` and `shared` are the two most
  recent to join), plus the two apps' `src/**/*.test.ts`. `packages/ui` and `packages/i18n` are
  the exceptions : `ui` has no tests, `i18n` has `test/smoke.test.ts` and no config of its own.

  There, a test outside the glob is never run and `pnpm test` stays green, so a colocated
  `src/foo.test.ts` in a `packages/*` library is a file nothing executes. Shared helpers must
  keep no `.test` segment (`converter/test/memory-fs.ts`, `fixtures.ts`). Playwright E2E is the
  one thing outside vitest : `apps/desktop/e2e/**/*.test.ts`, run by `pnpm e2e`, never by
  `pnpm test` (see `docs/testing.md`).

## Gotchas

- `packages/ui` is shadcn-managed : kebab-case files, excluded from oxfmt.
- Tests : never mock `process.platform` ; use `describe.runIf`
  (see `docs/testing.md`).
