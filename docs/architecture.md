# Architecture

This document gives a new contributor a 30-minute overview of how Paradox Translation Toolkit is structured, what each package is responsible for, and which boundaries to respect when adding code.

For build commands and per-OS installer flows, see [building.md](./building.md). For the release process, see [publishing.md](./publishing.md).

---

## High-level shape

The repo is a **pnpm + Turbo monorepo** with three top-level groups:

- `apps/` - runnable applications (the desktop app and a developer CLI)
- `packages/` - reusable, FS-agnostic libraries
- `games/` - per-game plugins, all conforming to a common `GameDefinition` interface

The desktop app is **the only consumer of Electron**. The real file system is reached through `@ptt/fs-node`, whose single `nodeFs` is imported by the two apps and nothing else; the core libraries (`parser`, `converter`, `translate`, `report`, the game plugins) receive it as an injected `FsLike`. `translate` reaches the network the same way, through an injected `FetchLike`. This is what makes all of them unit-testable without a disk or a server, and what lets the CLI run exactly the same pipeline as the app.

---

## Repository layout

```
paradox-translation-toolkit/
├── apps/
│   ├── desktop/                  # Electron + React app (@ptt/desktop)
│   └── cli/                      # Headless front end, same pipeline (@ptt/cli)
├── packages/
│   ├── shared/                   # IPC contracts, injected-port types, Zod schemas (@ptt/shared)
│   ├── parser/                   # Paradox locale parser/serializer + markup grammar (@ptt/parser)
│   ├── converter/                # FS-agnostic pipeline, file-level and key-level (@ptt/converter)
│   ├── translate/                # Translation engine, providers, memory, glossary (@ptt/translate)
│   ├── report/                   # JSON + CSV run reports (@ptt/report)
│   ├── fs-node/                  # The single production FsLike (@ptt/fs-node)
│   ├── ui/                       # shadcn/ui primitives + Tailwind globals (@ptt/ui)
│   └── i18n/                     # i18next setup + locale JSON files (@ptt/i18n)
├── games/
│   ├── game-stellaris/           # Stellaris (281990)
│   ├── game-eu4/                 # Europa Universalis IV (236850)
│   ├── game-eu5/                 # Europa Universalis V (3450310)
│   ├── game-hoi4/                # Hearts of Iron IV (394360)
│   ├── game-ck3/                 # Crusader Kings III (1158310)
│   ├── game-vic3/                # Victoria 3 (529340)
│   ├── game-imperator/           # Imperator: Rome (859580)
│   └── game-registry/            # Aggregates the games (@ptt/game-registry)
└── docs/
```

---

## Package responsibilities

### `@ptt/parser`

Hand-written tokenizer + parser for Paradox `_l_<lang>.yml` files. Handles BOM, the `KEY:VERSION "value"` syntax, escapes, color codes, comments, multi-line values, and per-locale CRLF/LF line endings. Produces structured AST nodes (including an ordered `body[]` that preserves the original layout, interleaved comments and blank lines included), so a parse → mutate → serialize round-trip leaves zero diff noise on git-versioned mods. Diagnostics replace exceptions wherever possible: a malformed mod file should not crash the pipeline. Coverage threshold: ≥ 90%.

### `@ptt/converter`

The generation pipeline: **scan → diff → plan → apply**.

- `scan` walks a folder using an injected `FsLike` adapter and discovers locale files
- `diff` compares the source language to each target language and lists missing keys
- `plan` produces an ordered list of file writes (in-place vs override-subdir, depending on mode)
- `apply` executes the plan via the same `FsLike`

Because `FsLike` is injected, this package has zero Electron dependencies and is fully unit-tested with an in-memory fake.

### `@ptt/shared`

The contract surface between processes. tRPC procedure types, IPC DTOs, Zod schemas for runtime validation, and the canonical `IPC_CHANNELS` constants. Anything that crosses the main/renderer boundary or the desktop/core boundary is defined here.

The package exports two entry points:

- `@ptt/shared`: full surface (types + Zod schemas).
- `@ptt/shared/ipc-channels`: channel constants only, **no zod**. The sandboxed preload imports from this sub-export to keep the bundle tiny: any module reachable from the preload's import graph gets bundled into the CJS output, and we don't want zod in there.

### `@ptt/game-<id>` and `@ptt/game-registry`

Each supported game is its own package exporting a `GameDefinition` (id, Steam app id, locale folder name, layout flag, language token map, override subdirs). The registry aggregates them.

The long term goal is to scope any future game-specific logic to these packages, keeping the core packages generic and FS-agnostic.

**Adding a new game is a new package + one line in the registry**, nothing in `parser` or `converter` changes. This is the architectural invariant we test for.

### `@ptt/translate`

Optional machine translation, contributed by [PR #4](https://github.com/khoeos/paradox-translation-toolkit/pull/4).

- `TranslationEngine` - batching, in-flight deduplication across mods, recursive batch splitting on failure, a circuit breaker after three consecutive single-string failures, and a mandatory markup check on every answer. A translation that lost a `$VARIABLE$` is refused, never written.
- Three providers behind one `Provider` interface: Ollama, any OpenAI-compatible endpoint, and a RapidAPI hub. All take an injected `FetchLike`.
- `TranslationMemory` - one JSON per language, written through tmp + rename, scoped per game and per provider+model by the caller.
- `buildGlossary` / `loadGlossary` - the wording read from the game's own localisation, which a model cannot guess.

### `@ptt/report`

The JSON and CSV reports of a run, key by key. Consumed by both apps. CSV fields starting with a formula character are neutralised: the source, key and mod-name columns come from third-party mod content.

### `@ptt/fs-node`

The one production `FsLike`, wrapping `node:fs/promises`. Imported by `apps/desktop` and `apps/cli`; no package imports it.

### `@ptt/ui`

shadcn/ui primitives, Tailwind v4 setup, the global stylesheet. Naming convention: kebab-case files (`button.tsx`, `dialog.tsx`). The desktop app composes these into PascalCase app-specific components (`Header.tsx`).

### `@ptt/i18n`

i18next configuration and the locale JSON files. See [ui-language.md](./ui-language.md) for adding a language.

### `@ptt/cli`

A headless front end to the same pipeline, contributed by [PR #4](https://github.com/khoeos/paradox-translation-toolkit/pull/4). Six commands: `scan`, `audit`, `convert`, `provider`, `memory`, `reports`. It calls the same `scanMods` and `runConvert` the desktop worker calls, through the same `ProgressPort`, which is what keeps the two from drifting into doing different things. `audit` is its reason to exist: it says which keys are still untranslated and why, mod by mod.

Build it with `pnpm --filter @ptt/cli build`, then run `apps/cli/bin/ptt.mjs`. Flags may live in a `ptt.config.json` in the working directory; see `apps/cli/ptt.config.example.json`.

### `@ptt/desktop`

The only Electron-aware package. Three sub-bundles built by `electron-vite`:

- **main** - Electron main process, owns file system access, tRPC server, settings (`electron-store`), auto-updater
- **preload** - exposes the typed IPC bridge to the renderer
- **renderer** - React 19 + TanStack Router (hash history) + TanStack Query + Zustand

---

## Tech stack

| Layer            | Choice                                                                              |
| ---------------- | ----------------------------------------------------------------------------------- |
| Runtime          | Electron 41, Node 24 LTS, pnpm 11                                                   |
| Build / bundling | electron-vite 5, Vite 7, Turbo 2                                                    |
| UI framework     | React 19, Tailwind CSS v4, shadcn/ui (radix-ui umbrella)                            |
| Routing          | TanStack Router (hash history, code-based routes)                                   |
| Server state     | TanStack Query 5                                                                    |
| Client state     | Zustand 5                                                                           |
| IPC              | Custom typed bridge over `ipcMain`/`ipcRenderer` + tRPC v11                         |
| Persistence      | `electron-store` (settings JSON, validated with Zod at boot)                        |
| Parser           | Hand-written, coverage ≥ 90%                                                        |
| Tests            | Vitest (unit), see [testing.md](./testing.md). No E2E yet.                          |
| Lint & format    | oxlint + oxfmt                                                                      |
| i18n             | i18next 26 + react-i18next 17, extracted with `i18next-cli` (CI gate)               |
| Updater          | `electron-updater` (channels: `latest` / `beta`)                                    |
| Versioning       | Changesets + `@changesets/changelog-github`                                         |
| Hooks            | Lefthook (`pre-commit`, `commit-msg`, `pre-push`)                                   |
| CI               | GitHub Actions: lint+typecheck+test on Win + Linux ; release on Win + Linux + macOS |

---

## Debugging

Persistent main-process logs are written by `electron-log` to:

- Windows: `%APPDATA%\Paradox Translation Toolkit\logs\`
- macOS: `~/Library/Logs/Paradox Translation Toolkit/`
- Linux: `~/.config/Paradox Translation Toolkit/logs/`

Override the level with `LOG_LEVEL=debug pnpm dev` (or `info` / `warn` /
`error`). Renderer-side errors caught by the React `ErrorBoundary` are
forwarded via the `app.logRendererError` tRPC procedure and end up in the
same file.

Native crashes (renderer / GPU) produce minidumps in `app.getPath('crashDumps')`.
Uploading is disabled - attach the dump file to a GitHub issue manually.

---

## Key flows

### User generates missing locale files

1. Renderer collects user input (game, mod folder, target languages, mode)
2. Calls a tRPC procedure exposed by the main process
3. Main process resolves the `GameDefinition` from the registry
4. `converter.scan` walks the mod folder via Node's `fs`
5. `parser` parses each discovered file
6. `converter.diff` produces missing-key lists per target language
7. `converter.plan` emits the file-write plan (respecting in-place vs override-subdir mode)
8. `converter.apply` executes the plan
9. Result returned to the renderer; UI shows what was written

### Auto-update on launch

1. App boots, reads settings via `electron-store` (channel: `latest` or `beta`)
2. After 5s, `electron-updater` checks the GitHub Releases manifest (`latest.yml` / `beta.yml`)
3. If a newer version exists, it's downloaded differentially (NSIS blockmap on Windows, zsync on Linux AppImage)
4. User is prompted to restart and apply

---

## Invariants worth preserving

- **Core packages stay FS-agnostic.** `parser`, `converter`, `translate` and `report` must not import `node:fs` or any Electron API. Anything FS-related goes through the injected `FsLike`, and anything network-related through the injected `FetchLike`. Only `apps/*` import `@ptt/fs-node`.
- **The worker and the CLI consume the same contract.** `scanMods` and `runConvert` live in `converter` and take a `ProgressPort`; the desktop worker posts to a `MessagePort` and the CLI renders a ticker. A behaviour added to one is a behaviour added to both, by construction rather than by discipline.
- **The renderer value-imports only zod-free subexports.** `@ptt/converter/progress` for the job-event protocol and `@ptt/translate/defaults` for the settings bounds. A value import of a package root pulls zod and the whole pipeline into the renderer bundle.
- **Adding a game is additive.** New `@ptt/game-<id>` package + one entry in `game-registry`. Touching `parser` or `converter` for game-specific logic is a smell.
- **`@ptt/shared` owns cross-boundary value domains.** `ConvertMode` and `LanguageCode` are derived from `as const` tuples next to their zod schemas, so the union and the validator cannot drift. Don't redefine them inline in `apps/desktop`.
- **Cancellation is cooperative.** A run is never killed: the worker checks a flag between units of work and acknowledges a `cancel` message, and only a 5-second timeout falls back to a kill. A kill mid-flush used to leave a truncated translation memory.
- **The sandboxed preload only imports zod-free modules.** Concretely: import IPC channel constants from `@ptt/shared/ipc-channels`, never from the package root. Anything reachable from the preload's import graph gets bundled into the CJS output, and the preload is meant to stay tiny.
- **All user input is validated at the IPC boundary** with Zod schemas from `@ptt/shared`. The bridge ([`apps/desktop/src/main/ipc/bridge.ts`](../apps/desktop/src/main/ipc/bridge.ts)) rejects malformed envelopes before any procedure runs.
- **`shell.openPath` goes through the path policy** ([`apps/desktop/src/main/services/path-policy.ts`](../apps/desktop/src/main/services/path-policy.ts)). The policy is multi-layer: directory check → critical-folder blocklist → trusted sources (registry / Paradox-typical paths / persisted user-allowed) → interactive bypass modal. See [known-issues.md](./known-issues.md#folder-authorisation-prompts).
- **i18n keys come from `@ptt/i18n` only.** No literal strings in renderer components for user-visible text. Plural variants must be filled for every CLDR category present in the locale, otherwise lookups return empty.
- **Long-running tRPC procedures are explicit.** A renderer-side watchdog rejects IPC requests that don't reply within 120 s. Procedures whose work outlives that window (currently `converter.scan`, `converter.run`, `converter.scanMods`, `converter.convert`) are listed in `LONG_RUNNING_PATHS` in [`ipc-link.ts`](../apps/desktop/src/renderer/src/lib/ipc-link.ts) and signal completion through job events instead.
