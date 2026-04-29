# Publishing & releasing

This guide covers everything from "I just merged a PR" to "the new version is downloadable on GitHub Releases".

The repo uses **Changesets** to manage versions and changelogs, and **electron-updater** + **GitHub Releases** as the distribution channel. Two release tracks are supported: **stable** and **beta**.

---

## TL;DR

| Action                                           | Command                                        |
| ------------------------------------------------ | ---------------------------------------------- |
| Add a release note while developing              | `pnpm changeset`                               |
| Enter beta mode (next versions are pre-releases) | `pnpm changeset pre enter beta`                |
| Cut a beta version                               | `pnpm changeset version` _(while in pre-mode)_ |
| Exit beta mode                                   | `pnpm changeset pre exit`                      |
| Cut a stable version                             | `pnpm changeset version` _(out of pre-mode)_   |
| Tag + push (triggers CI release)                 | `git tag v<version> && git push --tags`        |

---

## What gets versioned

Only `@ptt/desktop` and the root `paradox-translation-toolkit` versions matter for distribution today. The library packages (`@ptt/parser-core`, `@ptt/converter-core`, etc.) are versioned by Changesets but never published to npm, their version field is just internal bookkeeping.

The git tag should match `@ptt/desktop`'s version: `v3.0.0`, `v3.1.0-beta.2`, etc. CI's `release.yml` triggers on tag push.

---

## During development

For every PR, add a changeset describing the change:

```bash
pnpm changeset
```

The interactive prompt asks:

1. Which packages are affected (toggle with space)
2. What kind of bump (major / minor / patch, Changesets handles 0.x and pre-release semantics)
3. A short summary of the change

Commit the generated `.changeset/*.md` file with the rest of the PR. Don't write the changelog by hand, it's regenerated from these files at version time.

---

## Stable releases

Out of pre-mode, the flow is:

```bash
# 1. Consume all pending changesets, bump versions, regenerate CHANGELOG.md per package
pnpm changeset version

# 2. Review the diff (especially the resulting @ptt/desktop version)
git diff

# 3. Commit
git add -A
git commit -m "chore: release v3.0.0"

# 4. Tag matching @ptt/desktop's new version + push
git tag v3.0.0
git push origin main --tags
```

CI takes over:

- Builds Win + Linux + macOS installers via `electron-builder --publish always`
- Generates `latest.yml` (the manifest read by `electron-updater`)
- Publishes a draft GitHub Release with all artifacts attached

The maintainer then **publishes the draft** from the GitHub UI (release notes are pre-filled from the CHANGELOG entries). Apps installed in the field detect the new release at next launch (5s after boot if `autoCheckUpdates` is enabled).

---

## Beta releases

Beta versions follow the same flow but go through Changesets' **pre-mode**.

### Entering pre-mode

```bash
pnpm changeset pre enter beta
```

This creates `.changeset/pre.json` recording the entry. While in pre-mode, every `pnpm changeset version` call produces pre-release versions (`3.1.0-beta.0`, `3.1.0-beta.1`, …) instead of stable bumps.

### Cutting a beta

```bash
# Add changesets as usual (or carry forward existing ones)
pnpm changeset

# Bump versions in beta mode
pnpm changeset version
# → e.g. @ptt/desktop 3.0.0 → 3.1.0-beta.0

git add -A
git commit -m "chore: release v3.1.0-beta.0"
git tag v3.1.0-beta.0
git push origin main --tags
```

CI detects the `-beta` suffix in the version → publishes as a **GitHub pre-release** with `beta.yml` (instead of `latest.yml`).

Apps with **Subscribe to beta releases** enabled in Settings → Updates will fetch `beta.yml` and offer the update. Stable users only see `latest.yml` so betas are invisible to them.

### Iterating on betas

Just keep adding changesets and running `pnpm changeset version`, each call increments the pre-release counter (`-beta.1`, `-beta.2`, …).

### Promoting a beta to stable

When ready:

```bash
pnpm changeset pre exit
pnpm changeset version
# → e.g. @ptt/desktop 3.1.0-beta.5 → 3.1.0

git add -A
git commit -m "chore: release v3.1.0"
git tag v3.1.0
git push origin main --tags
```

`pre exit` removes `.changeset/pre.json` and the next `version` produces stable bumps. Note that `pre exit` re-emits all pending changesets at version time, so the CHANGELOG entry for 3.1.0 contains everything that landed across 3.1.0-beta.0…beta.5.

---

## What happens in CI

[`.github/workflows/release.yml`](../.github/workflows/release.yml) runs on `push: tags: ['v*']`:

- Matrix: `windows-latest`, `ubuntu-latest`, `macos-latest`
- Steps: install (`pnpm install --frozen-lockfile`), `pnpm typecheck`, `pnpm test`, `pnpm --filter @ptt/desktop run release`
- The `release` script runs `electron-vite build && pnpm deploy --prod ./dist-deploy && electron-builder --publish always`
- `GH_TOKEN` is the standard `secrets.GITHUB_TOKEN`; no manual setup needed

---

## Differential updates

`electron-updater` ships differential downloads on three platforms:

- **Windows (NSIS)**: `.exe.blockmap` files generated alongside the installer; only changed blocks are downloaded
- **macOS (zip)**: same blockmap mechanism on the zip target
- **Linux (AppImage)**: native `zsync` integration

The `.deb` Linux target is shipped but doesn't auto-update, Linux users on `.deb` install manually (or use AppImage for auto-updates).

---

## Troubleshooting

**The release tag was created but no GitHub Release appeared**
→ Check the Actions tab. Most common cause: `GITHUB_TOKEN` doesn't have `contents: write` permission. Settings → Actions → General → Workflow permissions = "Read and write permissions".

**`electron-updater` says no update available even though there's a newer release**
→ The release is still a draft. Publish it from the GitHub UI.

**Beta channel users aren't getting the new beta**
→ `beta.yml` must exist in the GitHub Release assets. If only `latest.yml` is there, electron-builder didn't recognize the pre-release. Check that the version field actually contains `-beta.x`.

**A user installed a beta and now wants to go back to stable**
→ Toggling the setting switches the channel for _future_ checks. They stay on the beta version until the next stable release ≥ their current beta version. This is normal `electron-updater` behavior, no auto-downgrade.

---

## Code signing strategy

The auto-updater is the most attack-sensitive part of the app: a compromised release server or a MITM during download could ship a malicious binary that the OS would happily run. Without code signing, `electron-updater` has no way to verify that an incoming update was published by us. Our policy reflects that risk per platform.

### Windows - preparing for Certum Open Source (~30 €/year)

The build pipeline is wired for code signing, but it is **inactive** until a certificate is purchased and the secrets are configured. Today's Windows release ships **unsigned**; the renderer detects this and routes "Download" clicks to the GitHub release page rather than letting `electron-updater` install an unverified binary.

**To activate signing**:

1. **Buy the certificate**: [Certum Open Source Code Signing Certificate](https://shop.certum.eu) (~30 €/yr). Validation takes 1–3 weeks (ID check + proof of OSS maintenance). Ask Certum for the `.pfx` format, it is simpler to inject in CI than the HSM-only formats.
2. **Update `electron-builder.yml`**: set `win.signtoolOptions.publisherName` to the exact CN of the issued certificate. Typical Certum Open Source format: `Open Source Developer, <Real Name>`. Verify with `openssl pkcs12 -info -in cert.pfx -nokeys` after purchase.
3. **Configure GitHub Secrets** (Settings → Secrets and variables → Actions):
   - `WIN_CSC_LINK`: the `.pfx` content encoded in base64 (`base64 -w0 cert.pfx`).
   - `WIN_CSC_KEY_PASSWORD`: the `.pfx` passphrase.
4. **Cut a release tag**. CI exposes `PTT_WIN_SIGNED=1` automatically when `WIN_CSC_LINK` is non-empty; the desktop build embeds this flag, and the running app will trust `electron-updater` for auto-download + auto-install.
5. **Validate**: on a clean Windows VM, run `Get-AuthenticodeSignature .\paradox-translation-toolkit-<version>-setup.exe` and confirm `Status: Valid` and `SignerCertificate.Subject` matches `publisherName`.
6. **SmartScreen reputation**: the "Windows protected your PC" warning will persist for the first weeks until install volume accumulates. Users have to click "More info" → "Run anyway". An EV certificate would skip this but costs ~10× more and requires a hardware token.

⚠️ **Renewing the certificate**: keep the same CN at renewal time, otherwise installed users won't be able to auto-update from the old binary to the new one (`electron-updater` rejects the publisher mismatch).

### macOS - intentionally unsigned

Apple Developer Program membership (99 $/year) and the notarization workflow are **not pursued**. The macOS target still builds in CI (`.dmg`, `.zip`, x64 + arm64) so Mac users can download manually, but:

- The first launch requires right-click → Open (Gatekeeper). README documents this.
- `electron-updater` is **disabled by design** on macOS: `autoUpdateSupported` is hard-coded to `false` in the main process. The "Download" button in the update banner opens the GitHub release page in the user's browser instead.
- `CSC_IDENTITY_AUTO_DISCOVERY: false` is set in `release.yml` so `electron-builder` doesn't search for a non-existent identity.

### Linux - intentionally manual

Same posture as macOS. AppImage and `.deb` are built and published, but there is no auto-update; users follow the in-app notification to GitHub Releases and download manually. No GPG signature is published today, a future enhancement could add detached `.sig` files for users who want to verify, but that is out of scope for now.

### Update flow recap

| Platform                  | Build artifact      | Auto-update behaviour                         | Triggered by                                    |
| ------------------------- | ------------------- | --------------------------------------------- | ----------------------------------------------- |
| Windows (unsigned, today) | `.exe` NSIS         | Notification only → opens GitHub release page | `download()` redirects via `shell.openExternal` |
| Windows (signed, future)  | `.exe` NSIS, signed | In-place download + restart-to-install        | `electron-updater`                              |
| macOS                     | `.dmg`, `.zip`      | Notification only → opens GitHub release page | `download()` redirects                          |
| Linux                     | `.AppImage`, `.deb` | Notification only → opens GitHub release page | `download()` redirects                          |

The version-detection step (`check()`) works on every platform, only the download path differs.
