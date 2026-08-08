---
'@ptt/desktop': minor
'@ptt/converter-core': minor
'@ptt/parser-core': minor
'@ptt/shared-types': minor
'@ptt/i18n': minor
---

Batch scanning over a whole mod collection, key-level coverage between mods, a generated translation
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

New packages: `@ptt/translate-core`, `@ptt/report-core`, `@ptt/fs-node`. New app: `@ptt/cli`, a
headless front end running the same pipeline, whose `audit` command lists which keys are still
untranslated and why.
