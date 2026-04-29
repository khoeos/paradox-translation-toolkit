# Known issues & limitations

This page lists known limitations and behaviours that may surprise users. If
you hit something that isn't listed here, please
[open an issue](https://github.com/khoeos/paradox-translation-toolkit/issues).

---

## Conversion

### Symlinks are skipped during scan

For security reasons, the converter does not follow symbolic links when walking
a mod folder. If a mod uses symlinks inside `localisation/` (or `localization/`),
those entries are ignored and a diagnostic is recorded.

**Why:** following a symlink could lead the scanner outside the mod folder
(e.g., a malicious archive containing `localisation/evil → /`) and cause the
app to write generated files into unrelated parts of your disk.

**Workaround:** replace the symlink with a real folder/file copy.

### `.bak` files keep only one previous version

When you run the converter with **Overwrite existing files** enabled and the
target file already exists, the previous content is saved as `<file>.bak`
right next to the original. Running the converter again with overwrite still
on will **replace** that `.bak` with the new previous version, there is no
multi-step history.

The backup is created **only after** the new content has been successfully
written to a temp file (and only if that write succeeded). A failed
conversion never leaves a stale `.bak` next to the original.

**Workaround:** if you need to keep a specific version, rename the `.bak`
yourself before running another overwrite.

### Files in `replace/` are translated independently

Files under a mod's override folder (e.g. `localisation/replace/`) are scanned
and translated separately from the regular files. A French file in
`replace/` does not count as fulfilling the regular French slot for the same
mod, they are tracked as two distinct entries.

This is intentional: `replace/` files override base-game localisation, while
regular files only add to it. They serve different purposes and should be
translated independently.

### Only one conversion can run at a time

If you click "Convert" while another job is still scanning or writing, the
second click is rejected with a "Another conversion job is already running"
toast. Wait for the active job to finish or cancel it from the progress
modal before starting a new one.

**Why:** running multiple converter workers in parallel against the same
folder would race on writes and produce inconsistent `.bak` files.

### Source files larger than 50MB are skipped

Each individual source `.yml` is capped at 50MB. Files above the cap show up
in the "failed" section of the result modal with an "exceeds 50MB" error;
nothing is written for them.

**Why:** typical localisation files are well under 1MB. A multi-hundred-MB
file is either corrupt or maliciously crafted to exhaust memory in the
worker.

**Workaround:** if you have a legitimate reason to translate a huge file,
split it into smaller `_l_<lang>.yml` files (Paradox loads all of them
together).

### "Extract to folder" refuses colliding mod basenames

In **Extract to folder** mode, the output of each mod is written under
`<output>/<modBasename>/...`. If the scan finds two mods whose folder name
(basename of the mod root) is identical, typically because the user
selected a parent that contains both `A/my_mod/` and `B/my_mod/`,
the converter refuses to run with an explicit error listing the conflicting
paths.

**Why:** silently merging two mods with the same name into one output
folder would either lose files or produce non-deterministic results.

**Workaround:** rename one of the mod folders, or run the converter twice,
once per parent folder.

### Multi-line values are accepted but not standard

Paradox's official `.yml` format expects every value on a single line. The
parser tolerates values whose closing `"` is on a later line (useful for
hand-crafted multi-paragraph dialogue), but the line endings inside the
value are preserved verbatim, and Paradox games may handle this
inconsistently. Use `\n` escapes inside a single-line value when in doubt.

## UI

### Folder authorisation prompts

To prevent the renderer from coercing the main process into opening
arbitrary files via the OS shell, the toolkit gates every `openPath`
through a multi-layer policy:

1. **Must exist and be a directory.** Files (e.g. an `.exe` typed into
   a path field) are always refused.
2. **Critical OS folders are hard-refused, no override.** Two flavours:
   - **Deep block**: the path itself and every descendant. Covers real
     system locations: `C:\Windows`, `C:\System Volume Information`,
     `C:\$Recycle.Bin` ; `/System`, `/private` on macOS ;
     `/etc`, `/usr`, `/bin`, `/sbin`, `/boot`, `/proc`, `/sys`, `/dev`,
     `/root` on Linux.
   - **Root-only block**: the literal root (which isn't useful to open
     at the top level) is refused, but **descendants are allowed**.
     Covers user/app containers: `C:\Users`, `C:\Program Files`,
     `C:\Program Files (x86)`, `C:\ProgramData` ; `/Applications`,
     `/Users`, `/Library` on macOS ; `/home`, `/var` on Linux. This is
     what makes Steam under `C:\Program Files (x86)\Steam\…\workshop\…`
     and Paradox mods under `C:\Users\<you>\Documents\Paradox Interactive\…`
     reachable without an "Authorize" prompt.

   Drive roots (`C:\`, `D:\`, …) and the user's home directory itself
   are also deep-refused. The "Authorize" modal does not appear for any
   of these, you'd have to edit `settings.json` by hand if you really
   meant it.

3. **Already-trusted paths open silently.** This covers:
   - Folders you picked through the in-app folder dialog,
   - Folders generated by a recent conversion job,
   - Paths matching a typical Paradox layout: any segment named
     `Paradox Interactive`, a registered game ID, display name, Steam app
     ID, localisation directory name, or language file token (`english`,
     `simp_chinese`, …); plus any path containing a `workshop/content/`
     sequence.
   - Folders previously approved as "Always allow" (persisted in
     `settings.userAllowedFolders`).
4. **Anything else triggers the "Authorize folder?" modal**, with three
   choices:
   - **Cancel**: request refused with a `FORBIDDEN` toast.
   - **Allow once**: added to an in-memory session list. Works for the
     current session only.
   - **Always allow**: persisted to `userAllowedFolders` in settings.
     Future sessions skip the modal for this exact path.

You can review and remove persisted entries from
**Settings → Allowed folders**.

If you need to inspect a folder the app refuses, open it directly from
your file manager. The policy only governs paths the app itself opens on
your behalf.

### Diagnostics: "Open log folder"

Settings → Diagnostics has an "Open log folder" button that opens
`app.getPath('logs')` in your file manager. Useful when you want to
attach the latest log files to a bug report without hunting through
`%APPDATA%`.

## Reporting issues

### Where to find logs and crash dumps

If something goes wrong, attaching the following two folders to your bug
report makes triage much faster:

- **Logs** (rotated, last ~50MB):
  - Windows: `%APPDATA%\Paradox Translation Toolkit\logs\`
  - macOS: `~/Library/Logs/Paradox Translation Toolkit/`
  - Linux: `~/.config/Paradox Translation Toolkit/logs/`

  The Settings → Diagnostics → "Open log folder" button takes you there
  in one click.

- **Crash dumps** (native renderer/GPU crashes, uploaded only if you
  attach them yourself, never sent automatically):
  - Windows: `%APPDATA%\Paradox Translation Toolkit\Crashpad\reports\`
  - macOS: `~/Library/Application Support/Paradox Translation Toolkit/Crashpad/completed/`
  - Linux: `~/.config/Paradox Translation Toolkit/Crashpad/completed/`

### IPC requests time out after 120 s

A renderer-side watchdog rejects any IPC request that hasn't received a
reply from the main process within two minutes. The two long-running
conversion procedures (`converter.scan`, `converter.run`) are explicitly
exempt, they signal completion through job events, not the request
itself. If you see an `IPC request timed out` toast on a non-conversion
action, that's a bug; please attach the latest log file to your report.

### "Worker bundle missing"

If the app starts and immediately fails with `Worker bundle missing at …`,
the production build was packaged without the converter worker bundle.
Re-run `pnpm --filter @ptt/desktop build` (or reinstall from a fresh
release artefact), there is nothing actionable on the user side beyond
that.

### Settings reset to defaults on launch

If your previously-configured mod folders, languages, allowed folders,
etc. are gone after a launch, the underlying `settings.json` file was
found in a state the toolkit couldn't safely parse (typically after a
hand-edit gone wrong or a version upgrade with a schema change), and
the boot validator reset it to defaults rather than crashing the app.
The reason is recorded in the log file. Re-pick your folders and
re-toggle your preferences from the Settings page; nothing else needs
doing.

## Builds

### macOS builds are unsigned

The macOS `.dmg` / `.zip` artifacts are built in CI but not code-signed.
Gatekeeper will refuse to launch them on first run; you will need to
right-click → Open and explicitly confirm. Community testing only.

### Linux Wayland session

Some Wayland sessions render Electron windows incorrectly on first launch.
If you see a blank or mis-sized window, run with
`--ozone-platform-hint=auto` or restart the app.

---

If something else feels wrong, the
[issues page](https://github.com/khoeos/paradox-translation-toolkit/issues)
is the best place to report it.
