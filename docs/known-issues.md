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

A `.bak` is only produced when a run actually replaces an existing target
file, which only happens under **Complete the file** or **Translate
everything again**. **Fill in what is missing** never writes to an existing
file at all (it diverts to a separate file instead), so it never produces a
`.bak` either.

When a replacement does happen, the previous content is copied to
`<file>.bak` right next to the target: after the new content has been
successfully written to a temp file, but before that temp file is renamed
onto the target. A failed conversion never leaves a stale `.bak` next to the
original. Running the converter again in one of the two replacing choices
will **replace** that `.bak` with the new previous version, there is no
multi-step history.

If the copy itself fails, the run is **not** aborted: the new file is still
written, and the backup failure is recorded as an error on the run's result
instead, so a backup you were counting on can be missing even though the
conversion "succeeded".

**Workaround:** if you need to keep a specific version, rename the `.bak`
yourself before running another replacing choice, and check the run's
errors if you need to confirm a backup was actually taken.

### Replacement only ever targets the natural filename

**Complete the file** and **Translate everything again** replace the file at
the natural name derived from the source file's own name, the same name
**Fill in what is missing** would use if there were no existing file there.
A hand-written translation kept under any other filename is never matched by
either mode, so it is neither replaced nor lost, but the toolkit also has no
way to know it exists.

**Workaround:** rename your translation to the natural `_l_<lang>.yml` name
if you want a replacing choice to take it over.

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
folder would race on writes, including the `.bak` copy taken when a file is
replaced under **Complete the file** or **Translate everything again**.

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

### Mods declaring more than 128MB of localisation are scanned partially

The scan reads a mod's localisation files until 128MB of them have been read,
then stops on that mod with an error naming the file it stopped at and how
many were left unread. The mod is still reported, its generated files are
never pruned (an error blocks the prune), and the rest of the collection is
scanned normally. The per-file 50MB cap now applies to the scan too, not only
to the write path.

**Why:** every key read stays in memory until the mod is planned. One Workshop
mod (EU5 transliterated location names) ships 2033 well-formed files, none
above 1.4MB, for 697MB and 15.7M entries: reading it all aborted the process
with a heap out-of-memory error, which took down the scan of the whole
collection instead of failing one mod.

**Workaround:** scan that mod on its own, or split it, if its localisation is
genuinely that large.

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

### Loosely written lines are normalised when the file is rewritten

The parser accepts the shapes the Paradox loader accepts even though the format
does not describe them: an apostrophe, a space or a non-ASCII letter inside a
key, a non-breaking or zero-width space used as indentation or as filler around
the `:`, and a space between the `:` and the version number. Vanilla Stellaris
itself ships 641 lines of that kind.

The key is stored trimmed and the `key:version "value"` separator is rebuilt
from scratch, so any such line comes back normalised when the toolkit writes the
file: `key : "v"` becomes `key: "v"`, and a non-breaking-space indent becomes a
plain space. The game reads both spellings identically. This is not a
regression either: those lines used to be rejected outright, so a rewrite lost
them rather than normalising them. Preserving the original separator byte for
byte would mean carrying it on every entry, which is a deliberate deferral.

### Inter-mod coverage is matched on key names only

A localisation mod is credited with covering another mod when it declares a
dependency on it, or, failing that, when at least half of the keys it
translates also exist in that mod's source language. The overlap is measured
on key **names**, never on values, so two unrelated mods that happen to share
a naming convention can be read as one patching the other. A false positive
suppresses the generation of keys by leaning on a translation that is not
actually there.

**Workaround:** the scan lists who covers what (`covered by` in the mod list,
the `Mods whose translation our generated mod hides` section in `ptt scan`).
An implausible entry there is the signal.

### The glossary takes the first official rendering it finds

Whole source strings the base game already translates bypass the translation
backend entirely, which is almost always right: the official wording is what
players expect. But unlike the short-term glossary, there is no majority vote
and no length filter on those whole-string matches, so an official rendering
of a string used in a different context wins anyway.

Short terms injected into the prompt _are_ voted on, keeping the most common
rendering across the whole game.

### Translation retries have no backoff

A failed batch is retried immediately, then split in half, then retried again.
A `429 Too Many Requests` is therefore replayed at once and the `Retry-After`
header is ignored. The retry count is bounded, so this cannot loop, but it is
more aggressive than a hosted service would like. The circuit breaker stops
everything after three consecutive single-string failures.

### A literal `{0}` in a source string breaks the RapidAPI provider

That provider cannot be told to leave markup alone, so every markup token is
replaced by a numbered placeholder before sending and put back afterwards. A
source value that already contains `{0}` collides with the scheme, the
placeholders no longer line up, and the string is refused. It fails closed:
the value stays in the source language, never half-translated.

### The glossary cache is invalidated by path only

A glossary built from a game installation is cached and reused as long as the
game path is identical. Patching the game at the same path serves a stale term
until the cache is cleared. Delete `<userData>/glossary` to force a rebuild.

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

The boot validator checks `settings.json` **field by field**: only the
field that fails validation (typically after a hand-edit gone wrong or a
version upgrade with a schema change) is reset to its default, the rest of
your settings survive. If, say, your target languages are back to empty
after a launch, your mod folders and allowed folders are unaffected. The
reason is recorded in the log file. Re-set the affected field from the
Settings page; nothing else needs doing.

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
