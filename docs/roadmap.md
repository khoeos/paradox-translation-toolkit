# Roadmap

This document tracks the high-level direction for Paradox Translation Toolkit. It's not a contract, items can move between sections, get reprioritised, or be dropped based on feedback and available time.

For granular tasks, see the [GitHub Issues](https://github.com/khoeos/paradox-translation-toolkit/issues).

---

## Next (planned for the upcoming versions)

- Playwright + Electron E2E tests
- Renderer-side unit tests (hooks, stores, components) before the editor work begins

## Later (ideas, no commitment)

- **Built-in mod explorer + translation editor**: browse mods directly from the configured workshop / mod folders, drill into keys, create / edit / delete entries and files in place. Will require a multi-slot job scheduler (current single-active-job constraint is too strict), file watcher with conflict detection, transactional batch saves, and per-file undo. See [architecture.md](./architecture.md) for the building blocks already in place.
- Edit history / undo persisted to SQLite (Prisma is one candidate ORM, not committed).
- Integration with machine-translation APIs (opt-in, user-provided keys).
- MCP support so modders can have an LLM overview / update their translations through the toolkit.

---

## How priorities are decided

Priorities follow, roughly in order:

1. Bugs that corrupt user data or block the main flow
2. Game support and parser correctness across the existing supported games
3. Quality-of-life improvements requested by multiple users
4. New features

If you have feedback on what should move up or down, open a [discussion](https://github.com/khoeos/paradox-translation-toolkit/issues) or ping me on Discord.
