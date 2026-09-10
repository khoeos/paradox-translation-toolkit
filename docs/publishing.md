# Publishing & releasing

This guide covers everything from "I just merged a PR" to "the new version is downloadable on GitHub Releases".

The repo uses **Changesets** to manage versions and changelogs, and **electron-updater** + **GitHub Releases** as the distribution channel. Two release tracks are supported: **stable** and **beta**.

---

## TL;DR

| Action                                           | Command                                      |
| ------------------------------------------------ | -------------------------------------------- |
| Add a release note while developing              | `pnpm changeset`                             |
| Enter beta mode (next versions are pre-releases) | `pnpm changeset pre enter beta`              |
| Cut a beta version                               | `pnpm release:version` _(while in pre-mode)_ |
| Exit beta mode                                   | `pnpm changeset pre exit`                    |
| Cut a stable version                             | `pnpm release:version` _(out of pre-mode)_   |
| Tag + push (triggers CI release)                 | `git tag v<version> && git push --tags`      |

---

## What gets versioned

Only `@ptt/desktop` and the root `paradox-translation-toolkit` versions matter for distribution today. The library packages (`@ptt/parser`, `@ptt/converter`, etc.) are versioned by Changesets but never published to npm, their version field is just internal bookkeeping.

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
pnpm release:version

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

- Builds Win + Linux + macOS installers in parallel, each with `electron-builder --publish never`
- Each runner emits its platform's update manifest (`latest.yml` / `latest-mac.yml` / `latest-linux.yml`, read by `electron-updater`) and uploads its artifacts
- A single final `publish` job collects every platform's artifacts and creates **one** GitHub Release for the tag, with all installers, all manifests, and the CHANGELOG section as the body

The release is published directly (not a draft), marked **Latest** for a stable version or **pre-release** for a `-beta` one. Apps installed in the field detect the new release at next launch (5s after boot if `autoCheckUpdates` is enabled).

---

## Beta releases

Beta versions follow the same flow but go through Changesets' **pre-mode**.

### Entering pre-mode

```bash
pnpm changeset pre enter beta
```

This creates `.changeset/pre.json` recording the entry. While in pre-mode, every `pnpm release:version` call produces pre-release versions (`3.1.0-beta.0`, `3.1.0-beta.1`, …) instead of stable bumps.

Since `@changesets/cli` 3, `pre.json` only holds `{ "mode", "tag" }` : the changesets already consumed by a beta are moved to `.changeset/pre/` instead of being listed inside it. The first `pnpm release:version` run after the 2.x → 3.x upgrade performs that migration, and as a side effect advances the pre-release counter of **every** workspace package once (`0.2.0-beta.0` → `0.2.0-beta.1`, …). Only `@ptt/desktop`'s version is distributed, so this is cosmetic ; later runs bump only the packages an actual changeset targets.

### Cutting a beta

```bash
# Add changesets as usual (or carry forward existing ones)
pnpm changeset

# Bump versions in beta mode
pnpm release:version
# → e.g. @ptt/desktop 3.0.0 → 3.1.0-beta.0

git add -A
git commit -m "chore: release v3.1.0-beta.0"
git tag v3.1.0-beta.0
git push origin main --tags
```

CI detects the `-beta` suffix in the version → publishes as a **GitHub pre-release** with `beta.yml` (instead of `latest.yml`).

Apps with **Subscribe to beta releases** enabled in Settings → Updates will fetch `beta.yml` and offer the update. Stable users only see `latest.yml` so betas are invisible to them.

### Iterating on betas

Just keep adding changesets and running `pnpm release:version`, each call increments the pre-release counter (`-beta.1`, `-beta.2`, …).

### Promoting a beta to stable

When ready:

```bash
pnpm changeset pre exit
pnpm release:version
# → e.g. @ptt/desktop 3.1.0-beta.5 → 3.1.0

git add -A
git commit -m "chore: release v3.1.0"
git tag v3.1.0
git push origin main --tags
```

`pre exit` removes `.changeset/pre.json` and empties `.changeset/pre/`, and the next `version` produces stable bumps. Note that `pre exit` re-emits all pending changesets at version time, so the CHANGELOG entry for 3.1.0 contains everything that landed across 3.1.0-beta.0…beta.5.

---

## What happens in CI

[`.github/workflows/release.yml`](../.github/workflows/release.yml) runs on `push: tags: ['v*']`:

- `build` matrix: `windows-latest`, `ubuntu-latest`, `macos-latest` by default, narrowable (below), `fail-fast: false`
- Per runner: install (`pnpm install --frozen-lockfile`), `pnpm typecheck`, `pnpm test`, then `pnpm --filter @ptt/desktop run dist`
- The `dist` script runs `electron-vite build && pnpm deploy --prod ./dist-deploy && electron-builder --publish never`, then `actions/upload-artifact` ships each platform's installers + manifests, minus two exclusions: `builder-debug.yml` (an electron-builder dump, no audience) and `*.dmg.blockmap` (differential-download data for a platform that cannot install an update in-app). `latest-mac.yml` is deliberately **not** excluded, it is what tells a mac user a new version exists
- The single `publish` job (`needs: [platforms, build]`, `if: !cancelled()`) downloads all artifacts and writes the release with `gh release create` / `edit`. Being the only writer, it cannot race into duplicate releases, and running under `if: !cancelled()` means a failed platform still produces a release (with the platforms that succeeded) and its changelog
- `GH_TOKEN` is the standard `secrets.GITHUB_TOKEN`; no manual setup needed
- Splitting build from publish is deliberate: three runners each calling `--publish always` on the same tag used to race and create duplicate GitHub Releases with partial assets

### Building only some platforms

A beta that only needs a Windows installer should not spend three runners on it.

Set the repository variable **`RELEASE_PLATFORMS`** (Settings > Secrets and variables >
Actions > Variables) to a comma-separated list of `windows`, `linux`, `macos`. Spaces and
case do not matter. Unset or empty means all three, so the default is always a complete
release:

```
RELEASE_PLATFORMS = windows
```

The next tag pushed then builds Windows alone. It has to be a variable rather than a
workflow input because the release runs on a **tag push**, where `inputs` does not exist.

For a one-off manual run, `workflow_dispatch` takes a `platforms` input which overrides the
variable, so no settings change is needed. A value matching none of the three tokens fails
the run loudly rather than publishing an empty release.

## Troubleshooting

**The release tag was created but no GitHub Release appeared**
→ Check the Actions tab. Most common cause: `GITHUB_TOKEN` doesn't have `contents: write` permission. Settings → Actions → General → Workflow permissions = "Read and write permissions".

**`electron-updater` says no update available even though there's a newer release**
→ Check the release actually carries this platform's manifest (`latest.yml` on Windows, `latest-mac.yml` on macOS, `latest-linux.yml` on Linux). A missing manifest means that platform's `build` leg failed but the `publish` job still ran; re-run the workflow so the failed platform rebuilds and its manifest is attached.

**Beta channel users aren't getting the new beta**
→ `beta.yml` must exist in the GitHub Release assets. If only `latest.yml` is there, electron-builder didn't recognize the pre-release. Check that the version field actually contains `-beta.x`.

**A user installed a beta and now wants to go back to stable**
→ Toggling the setting switches the channel for _future_ checks. They stay on the beta version until the next stable release ≥ their current beta version. This is normal `electron-updater` behavior, no auto-downgrade.
