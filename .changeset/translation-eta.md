---
"@ptt/desktop": minor
"@ptt/cli": minor
---

Added: time-left estimates during translation runs.

- Shows a remaining-time range for the whole run and for each mod, narrowing as the backend's pace settles.
- All texts are counted before translation starts, so the whole-run estimate appears immediately.
- When the provider rate-limits, the UI now shows the wait time until the next attempt instead of a stalled progress bar.
- The CLI shows the same estimate line.
