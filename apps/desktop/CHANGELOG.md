# @ptt/desktop

## 3.1.0

### Minor Changes

- ## Report page

  - Past reports are listed on their own page
  - Each report has it's own overview

- ## Custom target languages

  A target is now a language paired with the file token it's written under, so
  you can translate into any language, not just one your game already ships
  (e.g. Catalan), and save it under a token the game does read (e.g.
  `l_english`).

  - Built-in targets work exactly as before.
  - A new custom-target dialog lets you type any language and pick one of the
    game's own file tokens, with inline validation (unrecognized language,
    duplicate language, an undeclared token).
  - The RapidAPI provider still only supports its built-in languages and is
    refused before the run starts for anything else; OpenAI and Ollama accept
    any target language.
  - CLI: `--to Catalan:english` writes Catalan under `l_english`; `--to ru,de`
    keeps working as before.

  ### Fixes
  - With several target languages in one run with the RapidAPI provider
   language's base-game strings could be written into another language's files.
  - Two free-text language names that differ only in characters a file
    name cannot hold (accents, non-Latin scripts, spaces) shared a single
    translation-memory file, so each run discarded the other one's memory.
  - Fixed a bug in the machine-translation prompt: the source language sent to
    the provider was hardcoded to English regardless of the run's actual source
    language

  See [`docs/known-issues.md`](../docs/known-issues.md) for the current
  limitations (one target per normalized language per run, no glossary for an
  unshipped language, an in-place shadowing target's non-idempotence under a
  replacing content mode, RapidAPI's built-in-only support, and a free-text
  custom target being lost on downgrade to 3.0.0).

- ## Machine translation reliability

  A run can no longer degrade in silence. The glossary is found where the game
  actually keeps it, rate limits are waited out instead of hammered, and the
  report says why a key stayed in the source language.

  ### Added

  - **Warnings you can see.**
  - **The report shows the glossary**
  - **Why keys were not translated**
  - **Strings the model refuses are asked again once**
  - **Retranslate your own untranslated keys** (off by default)

  ### Fixes

  - **The glossary was looked for in the wrong place on half the games.** It was
    built from `<game path>/game/**`, but only CKIII, Victoria 3,
    Imperator and EU5 have that subfolder. HOIIV, Stellaris and
    EUIV keep `localisation/` at the root of the install.
  - **A rate-limited run retried immediately.** A `429` is now waited out, with
    `Retry-After` honoured.
  - **The engine could hang for the rest of a run.**
  - **A run built one glossary and reused it for every target language.** Each
    target language now gets its own.


  See [`docs/known-issues.md`](../docs/known-issues.md) for what this option does
  not do in "Add to current mod", and for how an answer identical to the source is
  remembered.

- ## Model auto-detection

  - The model field now offers what the endpoint actually serves: `/models` for OpenAI-compatible backends
    (LM Studio, vLLM, llama.cpp, the OpenAI API itself), `/api/tags` for Ollama
  - Typing a model name by hand still works, and RapidAPI is untouched since it picks its own model

- ## Improved releasing

  - Re-added windows standalone on CI
  - Added Auto-update on linux
  - Added direct download links on every releases
  - Removed MacOs Zip and blockmap (as there is no updater)
  - Renamed artifacts
  - Header version is now dynamic

## 3.0.0

### Major Changes

- # Paradox Translation Toolkit v3

  Full rewrite of the v2 codebase: new monorepo layout (one game-definitions package, FS-agnostic core), modern stack (Electron 41, React 19, TanStack Router/Query, tRPC v11, Zustand, Tailwind v4, Vitest, oxlint), and a hardened main process.

  ## Main features
  - **More games supported.** Added Europa Universalis V, Victoria 3, Imperator: Rome, Hearts of Iron IV. Total now: Stellaris, EU4, EU5, HoI4, CK3, Vic3, Imperator.
  - **Saved settings** - mod folder, output folder, source/target languages remembered per game and restored on tab switch.

  ## Conversion features
  - **Real Paradox-format parser** - proper tokenizer for `_l_<lang>.yml` (BOM, `KEY:VERSION "value"`, escapes, color codes), with diagnostics instead of crashes. Multi-line values now supported.
  - **Round-trip layout preservation** - line endings (CRLF/LF), inline and standalone comments, and blank lines keep their original position. Re-saving a parsed file produces zero diff noise on git-versioned mods.
  - **Source-language picker** - convert from any supported language, not just English.
  - **Robust path handling** - eliminates the v2 bug that corrupted mod folders containing language substrings (e.g. `englishtutor_mod`).
  - **Override-folder support** - files under `localisation/replace/` are translated independently from regular files.
  - **Atomic writes** - every generated file is written to a temp sibling and renamed in place (tmp → backup → rename). A mid-write crash never produces a truncated file, and a failed conversion never leaves stale `.bak` artefacts.
  - **Overwrite option** - toggle to force re-create target files, with the previous content saved as `<file>.bak` (one level of history).
  - **"Extract to folder" basename collision refusal** - explicit error when two distinct mods share the same basename, instead of silently merging them in the output.
  - **50 MB source size cap** - refuses oversized files rather than risking an OOM in the worker.

  ## Application

  - **In-app updater** - `electron-updater` over GitHub Releases with stable + beta channels. Differential download (NSIS blockmap on Windows, `zsync` on Linux AppImage). Until the Windows code-signing certificate is in place, every platform routes "Download" to the GitHub release page rather than auto-installing an unverified binary.
  - **i18n** - UI translated in English, French, Simplified Chinese. Single source of truth in `@ptt/i18n` with `i18next-cli` extraction wired in CI to catch missing keys before merge.
  - **Persistent file logging** - `electron-log` writes rotated logs (10 MB × 5 archives). Settings → Diagnostics has a one-click "Open log folder" button. `LOG_LEVEL=debug|info|warn|error` overrides the default.
  - **Local crash reporter** - native crashes (renderer / GPU) produce minidumps under `app.getPath('crashDumps')`. Nothing is uploaded; users attach the dump file to bug reports themselves.
  - **React error boundary** - a renderer crash now renders a recovery screen instead of leaving a blank window. The error is forwarded to the persistent log file.
  - **Virtualised result lists** - jobs producing thousands of files don't lag the UI (only ~30 DOM nodes rendered regardless of total count).

  ## Hardening

  - **Multi-layer folder authorisation** - `shell.openPath` is gated by a 4-layer policy:
    1. Path must exist and be a directory (no file launches via OS shell).
    2. OS-critical folders (`C:\Windows`, `/etc`, `/usr`, drive roots, …) hard-refused with no override.
    3. Already-trusted paths open silently: registry of paths picked through the dialog or generated by a job, plus paths matching a typical Paradox layout (workshop/content sequence, `Paradox Interactive` segment, registered game IDs / display names / Steam app IDs / locale tokens), plus user-approved persisted entries.
    4. Anything else triggers an "Authorize folder?" modal with Cancel / Allow once / Always allow. Persisted entries editable in Settings → Allowed folders.
  - **Symlinks skipped during scan** - blocks path-traversal attacks via crafted mod archives.
  - **Sandbox-bound writes** - every action's `targetPath` is verified to live inside its declared `sandboxRoot`. `..` segments rejected at plan time via `posixNormalizeStrict`.
  - **Window hardening** - protocol filter on `setWindowOpenHandler` (only `http(s)` and `mailto`), `will-navigate` blocked, `<webview>` attachments refused.
  - **Strict CSP via HTTP header in production** - injected by `webRequest.onHeadersReceived` (applies before HTML parsing). Includes `object-src 'none'`, `base-uri 'self'`, `form-action 'none'`, `frame-ancestors 'none'`.
  - **Strict IPC envelope validation** - every tRPC request is validated against a Zod schema at the bridge boundary before dispatch. Game IDs and language codes in settings are constrained to the registered enums, not free strings.
  - **IPC watchdog** - renderer-side timeout of 120 s on every tRPC request, with `converter.scan` / `converter.run` exempted (they finish out-of-band via job events). Prevents UI hangs when the main process becomes unresponsive.
  - **Settings store validation** - corrupted or partially migrated `settings.json` resets to defaults on boot rather than crashing the main process.
  - **Worker bundle integrity check** - boot fails fast with an explicit error if the converter worker bundle is missing from the install.

  ## Architecture

  - **Game definitions package** - adding a new game is one file in `@ptt/games` + one line in its registry. No changes to `parser` / `converter` ever needed.
  - **FS-agnostic core** - `parser` and `converter` depend on no Electron or Node FS APIs. The desktop app injects a `FsLike` adapter; tests inject an in-memory fake.
  - **Single-source IPC channel constants** - defined in `@ptt/shared/ipc-channels`, imported by both main and the sandboxed preload (which intentionally never pulls zod into its bundle).
  - **Auto-bumped versions & changelog** - Changesets workflow with `@changesets/changelog-github`.

  ## Tooling

  - **Vitest unit tests** across all packages: `parser` and `converter` enforce ≥ 90 % coverage. `path-policy` matrix tested on the active host OS. Game registry has an extensibility test asserting a game can be added without touching the core.
  - **Lefthook** git hooks: pre-commit lint + typecheck, commit-msg conventional-commits validation, pre-push full lint/typecheck/test.
  - **GitHub Actions CI**: lint + typecheck + test on Windows + Linux for every PR; release builds on Windows + Linux + macOS for every `v*` tag.

### Minor Changes

- Batch scanning over a whole mod collection, key-level coverage between mods, a generated translation
  mod, and optional machine translation.

  Designed and written by [**Artem Kondrashev**](https://github.com/blockbabyyy) in
  [PR #4](https://github.com/khoeos/paradox-translation-toolkit/pull/4), reimplemented here on the v3
  architecture. The original commits remain in this repository, and every commit that ports a piece of
  that work credits him as co-author.

  What it changes for you:

  - **Pointing at a whole workshop folder now works at scale.** Every mod is scanned, and what is
    missing is compared key by key rather than file by file. A mod whose Russian translation ships as a
    separate localisation mod is no longer reported as untranslated, and its real translation is never
    overwritten with English text tagged `l_russian`.
  - **A single translation mod.** The third convert mode, previously a disabled button, gathers every
    missing key of every selected mod into one mod under your game folder, namespaced per source mod so
    two mods shipping the same file name cannot collide. It is read back on the next run, so a second
    pass costs nothing and keys covered since last time are cleaned up.
  - **Optional machine translation.** Ollama, any OpenAI-compatible endpoint, or a RapidAPI hub. Markup
    tokens are compared on every answer: a translation that lost a `$VARIABLE$` is refused and the
    string stays in the source language rather than breaking in game. Translations are remembered on
    disk per game and per model.
  - **A scan step before converting**, with a per-mod list of what is missing and a rough duration
    estimate, because a local translation runs at a few lines per second.
  - **Stopping actually stops.** Cancel is honoured between mods and during the scan, and nothing is
    left half written.
  - **A key-by-key report** of every run, as JSON and as CSV.

  New packages: `@ptt/translate`, `@ptt/report`, `@ptt/fs-node`. New app: `@ptt/cli`, a
  headless front end running the same pipeline, whose `audit` command lists which keys are still
  untranslated and why.

- ## In-app problem reporting

  Added a "Report a problem" feature that sends feedback straight to a Discord webhook.

  - **Always included** - the current page, the selected game, and the chosen settings (languages, mode, target content, theme, update channel). Never any file paths.
  - **Opt-in technical info** - a toggle attaches folder paths and recent job summaries to help debugging.
  - **Optional contact**
  - **Community link**

  The webhook URL is injected at build time.

### Patch Changes

- Updated dependencies []:
  - @ptt/converter@1.0.0
  - @ptt/parser@1.0.0
  - @ptt/shared@1.0.0
  - @ptt/i18n@1.0.0
  - @ptt/report@1.0.0
  - @ptt/translate@1.0.0
  - @ptt/fs-node@1.0.0
  - @ptt/games@1.0.0
  - @ptt/ui@1.0.0