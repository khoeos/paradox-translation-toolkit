---
"@ptt/desktop": minor
"@ptt/cli": minor
---

## Machine translation reliability

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
