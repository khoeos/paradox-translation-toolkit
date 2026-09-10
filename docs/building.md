# Building installers

This guide covers building local installers for development and smoke testing. For the release process (tagging, publishing to GitHub Releases, beta channel, etc.), see [publishing.md](./publishing.md).

---

## Prerequisites

- All [contributing prerequisites](../CONTRIBUTING.md#requirements) (Node ≥ 24, pnpm ≥ 10)
- `pnpm install` already run at the repo root

---

## Build commands

```bash
pnpm --filter @ptt/desktop build:win      # NSIS installer + standalone zip
pnpm --filter @ptt/desktop build:linux    # AppImage + deb
pnpm --filter @ptt/desktop build:mac      # dmg, one per architecture
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

| Target  | Files                                                                                   |
| ------- | --------------------------------------------------------------------------------------- |
| Windows | `ptt-<version>-win-installer.exe` + `.blockmap`, `ptt-<version>-win-standalone-x64.zip` |
| Linux   | `ptt-<version>-linux-x86_64.AppImage`, `ptt-<version>-linux-amd64.deb`                  |
| macOS   | `ptt-<version>-mac-arm64.dmg` and `-mac-x64.dmg`, each with a `.blockmap`               |

`.blockmap` files carry the differential-download data. Windows uses its own, and the
AppImage embeds one inside itself. The macOS ones are built but excluded from the release
upload, being unreadable by a platform that cannot install an update in-app.

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

## Troubleshooting

**`electron-builder` complains about missing files in `node_modules`**
→ The `pnpm deploy` step probably failed. Make sure you're running through `pnpm --filter @ptt/desktop build:<target>` and not invoking `electron-builder` directly.

**Build is slow or hangs**
→ First builds compile native dependencies. Subsequent builds use the cache and should be much faster.

**The icon doesn't appear in the installer**
→ Check `apps/desktop/resources/` for the platform-specific icon files referenced in `electron-builder.yml`.

**`pnpm dev` or `pnpm build` fails with `electron-vite: Permission denied` (exit 126)**
→ The `electron-vite` tarball ships `bin/electron-vite.js` without the executable bit, and pnpm 11 links `node_modules/.bin/*` as plain symlinks (pnpm 10 used shell shims, which hid the problem). Every `pnpm install` that re-imports the package from the store brings the `644` mode back. The root `postinstall` script (`scripts/fix-bin-modes.mjs`) restores the bit on every real install pass ; if you hit the error anyway, run it by hand :

```bash
node scripts/fix-bin-modes.mjs
```

**`pnpm dev` fails with `Error: Electron uninstall`**
→ `node_modules/electron/dist` (the Electron binary) is missing : electron's own `postinstall`, which downloads it, did not run. pnpm skips it when it considers the package already built, typically after a reinstall that relinked `node_modules/electron`. `pnpm rebuild electron` is a no-op with `nodeLinker: hoisted`, run the installer directly :

```bash
node node_modules/electron/install.js
```
