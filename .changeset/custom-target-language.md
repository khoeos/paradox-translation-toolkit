---
"@ptt/desktop": minor
"@ptt/cli": minor
---

## Custom target languages

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
