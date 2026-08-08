# Paradox Translation Toolkit

Turbo + pnpm monorepo : Electron app (`apps/desktop`) + developer CLI (`apps/cli`) +
FS-agnostic cores (`packages/`) + one package per supported Paradox game (`games/`).

## Read docs/ first, by task

- Architecture and responsibilities : `docs/architecture.md`, section
  "Invariants worth preserving" (canonical, with two stale bullets : cross-boundary
  types are NOT all in `@ptt/shared-types`, see the duplications below)
- Add a game : `docs/game-support.md` (copy `games/game-stellaris`)
- Add a UI language : `docs/ui-language.md` (CLDR plural variants trap)
- Release, changesets, beta channel : `docs/publishing.md`
- Local installers : `docs/building.md` (dist-deploy workaround for pnpm)
- Test conventions : `docs/testing.md` ; deliberate product limitations :
  `docs/known-issues.md`

## Invariants (violable silently : watch these)

- `packages/parser-core`, `packages/converter-core`, `packages/translate-core` and
  `packages/report-core` are FS-agnostic : no `node:fs`, no Electron imports. They reach
  the FS only through the injected `FsLike` (`converter-core/src/types.ts`, in-memory fake
  at `converter-core/test/memory-fs.ts`, exported as `@ptt/converter-core/test/memory-fs`) ;
  `parser-core` is pure text and has no FS notion at all. `translate-core` reaches the
  network only through an injected `FetchLike`.
- Only `apps/desktop` may touch Electron. The real filesystem is reached through
  `@ptt/fs-node`, whose single `nodeFs` is imported by `apps/desktop` and `apps/cli` ; no
  other package imports `node:fs`.
- The preload's only cross-package import is `@ptt/shared-types/ipc-channels`, the
  zod-free subexport (the other import is `electron` itself). Anything reachable
  from the preload import graph ships in the preload bundle.
- The mod-level pipeline (`scanMods`, `runConvert`) lives in `converter-core` and takes a
  `ProgressPort` : `apps/desktop`'s worker and `apps/cli` call the same functions, which is
  what stops the two drifting. The translation engine reaches it as an injected
  `TranslationEnginePort`, so `converter-core -> translate-core` stays absent.
- The renderer value-imports only zod-free subexports : `@ptt/converter-core/progress` for
  `JobEvent` / `isJobEvent`, `@ptt/translate-core/defaults` for the settings bounds. A value
  import of a package root pulls zod and the whole pipeline into the renderer bundle (check
  with `grep -c ZodError apps/desktop/out/renderer/assets/index-*.js` after a build).
- `games/game-registry` array order = UI tab order (`builtInGames` ->
  `getGameSummaries()` -> `games.list` -> `GameTabs`, no sort on the path). A new
  game also needs its tab image wired in `GameTabs.tsx`.
- parser-core round-trip guarantee : parse -> mutate -> serialize must not
  introduce diff noise (BOM, CRLF/LF per locale, escapes preserved).
- Coverage thresholds live in each core's `vitest.config.ts` (lines/functions/statements 90 ;
  branches 85 parser-core, 80 elsewhere). They are NOT a gate : `test` is `vitest run` with
  no `--coverage`, so CI never evaluates them. Run
  `pnpm --filter @ptt/converter-core exec vitest run --coverage` to check.
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
- Legitimate and staying : key widening from `Object.entries()` / `Object.keys()`
  over a `Partial<Record<K, V>>` (`converter-core/src/plan.ts`, `scan.ts`,
  `game-registry/src/index.ts`) ; external types that are wrong or closed
  (electron-store `Store.set`, tRPC `_def._config`, `TRPCClientError.from`) ;
  `packages/ui` (vendored shadcn, never hand-edited) ; fixture traversal in tests.
  Add a one-line reason at the site : 17 of the 19 current sites have none.
- Boundaries : `renderer -> main` is validated (`RequestSchema.safeParse` in
  `main/ipc/bridge.ts`), but `main -> renderer` and `main -> worker` are not
  (`renderer/src/lib/ipc-link.ts`, `main/workers/converter.worker.ts` cast raw
  messages). Use zod there rather than adding a third cast. `LanguageCode` is the
  most-asserted type and `LanguageCodeSchema` already exists in `@ptt/shared-types` :
  derive an `isLanguageCode` guard from it instead of `value as LanguageCode`.
- Non-null `!` is fine in tests (`writes[0]!` is the direct cost of
  `noUncheckedIndexedAccess`), avoid it in `src`.

## Reuse before writing

- `packages/ui` ships 18 shadcn primitives (`ls packages/ui/src/components/`), 9
  with no consumer yet. Import `@ptt/ui/components/<kebab-name>` (no root `.`
  export) and `cn` from `@ptt/ui/lib/utils`. A missing primitive is installed
  (shadcn MCP in `.mcp.json`, or `pnpm dlx shadcn add`), never pasted.
- Never hand-roll path strings : `@ptt/converter-core` exports `posixJoin`,
  `posixDirname`, `posixBasename`, `posixSplit`, `posixNormalize`,
  `posixNormalizeStrict` (throws on `.` / `..`) and `posixContains` (sandbox
  containment). Two current bypasses are bugs to fix, not patterns to copy :
  `VirtualizedFileList.tsx` open-codes `posixDirname`, `main/services/path-policy.ts`
  re-creates `posixSplit` as `segmentsOf` next to the traversal guards.
- All `_l_<lang>.yml` text goes through `@ptt/parser-core` (`parse` / `serialize`),
  filenames through `parseFilename` / `buildFilename` ; the filename regex lives in
  `parser-core/src/filename.ts` and nowhere else.
- UI strings : write `t('section.key')` (plain dotted keys, no namespaces), then
  `pnpm --filter @ptt/i18n run extract`. Never invent a key directly in
  `packages/i18n/src/locales/*.json`, only fill translated values ; CI runs
  `extract:check`. `useTranslation` comes from `react-i18next`, and outside
  components use `i18next.t` (as `renderer/src/store/jobs.ts` does).
- `JobEvent` and `isJobEvent` now live in `converter-core/src/progress.ts`, with a
  `JOB_EVENT_TYPES` tuple the guard checks against : a variant one side emits and the other
  does not handle is rejected rather than falling through a `switch`. One duplication is
  left : `UpdaterStatus` + `UpdaterEvent` (`main/services/updater-service.ts` +
  `renderer/src/store/updater.ts`) belong in `@ptt/shared-types`, and `isUpdaterEvent` still
  only checks that `type` is a string.
- Internal deps are always `workspace:*` ; third-party deps shared by 2+ packages
  belong in the `catalog:` block of `pnpm-workspace.yaml`. Three shared deps are
  still pinned literally and can drift : `lucide-react`, `@types/react` (already
  drifted), `@types/react-dom`.
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
  `apps/desktop/src`, and all 42 files in `packages/*/src` + `games/*/src` :
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
  `games/game-<id>/src/index.ts` must export a const named exactly `<id>`, because
  `game-registry` does `import { <id> } from '@ptt/game-<id>'`.
- `...Schema` does not imply zod. Most `*Schema` identifiers are zod, but
  `SettingsSchema` (`main/services/settings-service.ts`) and `TranslationSchema`
  (`packages/i18n/src/index.ts`) are plain TS ; where the TS name was taken first the
  zod object got a `Zod` suffix as a one-off (`SettingsSchemaZod`). Do not
  generalize it : the healthy sibling pair is `SettingsPatch` / `SettingsPatchSchema`.
- Path aliases are declared as `@renderer/*`, `@main/*`, `@preload/*` but in practice
  only `@renderer/*` is used (49 imports, 1 for `@main`, none for `@preload`) ;
  inside `src/main` and in every `test/`, cross-directory relative imports are the
  norm, keep them. There is no `@/*` alias, yet `apps/desktop/components.json`
  advertises `@/components` : every app-level import the shadcn CLI writes has to be
  re-pointed to `@renderer/*`. Cross-package, import a declared `exports` subpath.
- Tests are always `*.test.ts` (no `.spec.`, no `__tests__/`) ; location is
  per-workspace : `packages/*` and `games/*` use a `test/` sibling of `src/`,
  `apps/desktop` colocates as `src/**/*.test.ts`. Only 3 workspaces pin an `include`
  (`apps/desktop`, parser-core, converter-core) : there, a test outside the glob is
  never run and `pnpm test` stays green. Shared helpers must keep no `.test` segment
  (`converter-core/test/memory-fs.ts`, `fixtures.ts`).

## Gotchas

- `packages/ui` is shadcn-managed : kebab-case files, excluded from oxfmt.
- Tests : never mock `process.platform` ; use `describe.runIf`
  (see `docs/testing.md`).
