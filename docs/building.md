# Building installers

This guide covers building local installers for development and smoke testing. For the release process (tagging, publishing to GitHub Releases, beta channel, etc.), see [publishing.md](./publishing.md).

---

## Prerequisites

- All [contributing prerequisites](../CONTRIBUTING.md#requirements) (Node ≥ 24, pnpm ≥ 10)
- `pnpm install` already run at the repo root

---

## Build commands

```bash
pnpm --filter @ptt/desktop build:win      # NSIS installer + zip
pnpm --filter @ptt/desktop build:linux    # AppImage + deb
pnpm --filter @ptt/desktop build:mac      # zip + dmg (universal arm64/x64)
pnpm --filter @ptt/desktop build:unpack   # unpacked app dir (for quick smoke testing)
```

For day-to-day development, you don't need to run any of these, `pnpm dev` from the repo root is enough.

---

## What happens internally

Each `build:*` command runs three steps:

1. **`electron-vite build`** - produces `apps/desktop/out/{main,preload,renderer}/...` (the bundled JS for the three Electron processes)
2. **`pnpm deploy --prod --legacy ./dist-deploy`** - creates a flat-`node_modules` deploy directory at `apps/desktop/dist-deploy/`. This is a workaround for `electron-builder` not understanding pnpm's symlinked `node_modules` structure.
3. **`electron-builder`** - runs against `dist-deploy/` and writes installers back into `apps/desktop/dist/` via `directories.output: ../dist`

> The intermediate `dist-deploy/` is gitignored.

---

## Outputs

Installers land in `apps/desktop/dist/`:

| Target  | Files                                                     |
| ------- | --------------------------------------------------------- |
| Windows | `.exe` (NSIS installer), `.exe.blockmap`, portable `.zip` |
| Linux   | `.AppImage`, `.deb`                                       |
| macOS   | `.dmg`, `.zip` (universal arm64/x64), blockmaps           |

The `.blockmap` files are used by `electron-updater` for differential downloads, leave them alongside the installer.

---

## Cross-platform builds

Each `build:*` target should be run on its matching OS for full validity. In particular:

- `build:mac` requires macOS for the `dmg` step
- `build:win` works cross-platform but the result is unsigned anyway
- `build:linux` works cross-platform

CI handles the matrix automatically, see [publishing.md](./publishing.md) for details.

---

## Testing the unpacked build

For quick smoke testing without producing a full installer:

```bash
pnpm --filter @ptt/desktop build:unpack
```

This produces `apps/desktop/dist/<platform>-unpacked/` which you can launch directly. Useful when you need to test a production-mode build but don't want to wait for installer generation.

---

## Code signing

Local builds are unsigned by default. The signing strategy (Windows Certum certificate plan, macOS intentionally unsigned, Linux intentionally manual) and how to inject the secrets in CI are documented in [publishing.md → Code signing strategy](./publishing.md#code-signing-strategy).

---

## Troubleshooting

**`electron-builder` complains about missing files in `node_modules`**
→ The `pnpm deploy` step probably failed. Make sure you're running through `pnpm --filter @ptt/desktop build:<target>` and not invoking `electron-builder` directly.

**Build is slow or hangs**
→ First builds compile native dependencies. Subsequent builds use the cache and should be much faster.

**The icon doesn't appear in the installer**
→ Check `apps/desktop/resources/` for the platform-specific icon files referenced in `electron-builder.yml`.
