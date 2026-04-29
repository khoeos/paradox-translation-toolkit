# Contributing

Thanks for your interest in contributing to Paradox Translation Toolkit! This document covers how to get set up and the conventions we follow. For deeper material, head to:

- [Project architecture](./docs/architecture.md) - how the monorepo is laid out and why
- [Building installers](./docs/building.md) - per-OS build instructions
- [Testing](./docs/testing.md) - how the test suite is organised
- [Releasing a new version](./docs/publishing.md) - Changesets + release flow
- [Adding a new game](./docs/game-support.md)
- [Adding a new UI language](./docs/ui-language.md)

---

## Ways to contribute

- **Code** - bug fixes, features, refactors. Open an issue first for anything non-trivial so we can align before you write code.
- **Translations** - add or improve UI translations in [`packages/i18n`](./packages/i18n). See [Adding a new UI language](./docs/ui-language.md).
- **Game support** - add a new Paradox game by creating a `@ptt/game-<id>` package. See [Adding a new game](./docs/game-support.md).
- **Testing** - try the app on real mods, on different OSes, and report what breaks.
- **Documentation** - fix typos, clarify steps, add screenshots.

---

## Requirements

- **Node** ≥ 24 (see `.nvmrc`)
- **pnpm** ≥ 10 (declared via the `packageManager` field)

### Recommended IDE setup

- [VSCode](https://code.visualstudio.com/) + [Oxc](https://marketplace.visualstudio.com/items?itemName=oxc.oxc-vscode)

---

## Quick start

```bash
corepack enable                 # if you don't have pnpm 10 globally, this enables the bundled version
pnpm install                    # install everything
pnpm lefthook install           # set up git hooks (lint, test, commit message validation)
pnpm dev                        # turbo run dev - launches the desktop app + the @ptt/ui watcher
pnpm test                       # run all tests
pnpm typecheck                  # run TypeScript across all packages
pnpm lint                       # oxlint
pnpm format                     # oxfmt
```

Filtered runs:

```bash
pnpm --filter @ptt/parser-core test
pnpm --filter @ptt/desktop dev
```

For installer builds, see [docs/building.md](./docs/building.md).

---

## Workflow

1. **Fork** the repository
2. **Create a feature branch** from `main`: `git checkout -b feature/my-change`
3. **Make your changes** and add tests where applicable
4. **Add a changeset** describing the change: `pnpm changeset` (see [docs/publishing.md](./docs/publishing.md))
5. **Commit** following the Conventional Commits convention
6. **Push** to your fork and **open a Pull Request** against `main`

The PR template will guide you through the checklist.

---

## Conventions

### Commits

We follow [Conventional Commits](https://www.conventionalcommits.org/), enforced by commitlint via Lefthook.

Common types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `ci`.

Examples:

```
feat(parser-core): support BOM detection in YAML files
fix(desktop): prevent crash when mod folder is missing
docs: clarify the override-subdir behavior
```

### Git hooks (Lefthook)

- `pre-commit` - lint + typecheck + test (test only on `main` / `develop`)
- `commit-msg` - commitlint
- `pre-push` - runs everything

### Code style

- **Naming** - PascalCase for app-specific components (`Header.tsx`)
- **Routes** - code-based with TanStack Router, hash history for Electron's `file://` protocol
- **CSS** - `@ptt/ui/globals.css` is the only stylesheet; theme variables in `:root` and `.dark`
- **Linting / formatting** - `oxlint` + `oxfmt`, run via `pnpm lint` and `pnpm format`

---

## Code of Conduct

By participating in this project you agree to abide by the [Code of Conduct](./CODE_OF_CONDUCT.md).

## Reporting security issues

Please do **not** open public issues for security vulnerabilities. See [SECURITY.md](./SECURITY.md) for the disclosure process.
