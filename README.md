[![stars-shield](https://img.shields.io/github/stars/khoeos/paradox-translation-toolkit.svg?style=for-the-badge)](https://github.com/khoeos/paradox-translation-toolkit/stargazers)
[![contributors-shield](https://img.shields.io/github/contributors/khoeos/paradox-translation-toolkit.svg?style=for-the-badge)](https://github.com/khoeos/paradox-translation-toolkit/graphs/contributors)
[![issues-shield](https://img.shields.io/github/issues/khoeos/paradox-translation-toolkit.svg?style=for-the-badge)](https://github.com/khoeos/paradox-translation-toolkit/issues)
[![release-shield](https://img.shields.io/github/v/release/khoeos/paradox-translation-toolkit?include_prereleases&style=for-the-badge)](https://github.com/khoeos/paradox-translation-toolkit/releases)
[![ci-shield](https://img.shields.io/github/actions/workflow/status/khoeos/paradox-translation-toolkit/ci.yml?branch=main&style=for-the-badge&label=CI)](https://github.com/khoeos/paradox-translation-toolkit/actions/workflows/ci.yml)
[![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey.svg?style=for-the-badge)](https://creativecommons.org/licenses/by-nc-sa/4.0/)

<h1 align="center">Paradox Translation Toolkit</h1>
<p align="center">
The easiest way to manage your missing translation files for Paradox games (and more).
</p>

<p align="center">
  <a href="https://github.com/khoeos/paradox-translation-toolkit">
    <img src="https://github.com/khoeos/Paradox-mod-language-converter/blob/main/screenshots/1.png?raw=true" alt="screenshot" width="700"/>
  </a>
</p>

<!-- TODO: replace with v3 screenshots once captured -->

  <p align="center">
      Cross-platform desktop tool that generates missing localisation files for Paradox games (Stellaris, EU4, EU5, HoI4, CK3) so mods stop displaying raw translation tags when your language isn't covered by the modder.
    <br />
    <a href="https://github.com/khoeos/paradox-translation-toolkit/releases"><strong>Download App »</strong></a>
    <br/>
    <br/>
    <a href="./docs/architecture.md">Explore the docs »</a>
    <br />
    <br />
    <a href="https://github.com/khoeos/paradox-translation-toolkit/issues">Report Bug</a>
    ·
    <a href="https://github.com/khoeos/paradox-translation-toolkit/issues">Request Feature</a>
  </p>

<!-- TABLE OF CONTENTS -->
<details open="open">
  <summary><h2 style="display: inline-block">Table of Contents</h2></summary>
  <ol>
    <li><a href="#main-functionalities">Main functionalities</a></li>
    <li><a href="#supported-games">Supported games</a></li>
    <li><a href="#download">Download</a></li>
    <li><a href="#how-to-use">How to use</a></li>
    <li><a href="#about-the-project">About the project</a></li>
    <li><a href="#contributing">Contributing</a></li>
    <li><a href="#useful-links">Useful links</a></li>
    <li><a href="#contact--support">Contact & Support</a></li>
    <li><a href="#license">License</a></li>
    <li><a href="#disclaimer">Disclaimer</a></li>
  </ol>
</details>

---

## Main functionalities

- Generate missing localisation files for any language
- Generate files directly in the mod folder or in a custom folder
- Working with multiple paradox games

## Supported games

| Game                  | Steam ID | Status                       |
| --------------------- | -------- | ---------------------------- |
| Stellaris             | 281990   | ✅ Tested                    |
| Crusader Kings III    | 1158310  | ✅ Tested                    |
| Europa Universalis IV | 236850   | ⚠️ Supported, lightly tested |
| Europa Universalis V  | 3450310  | ⚠️ Supported, lightly tested |
| Hearts of Iron IV     | 394360   | ⚠️ Supported, lightly tested |
| Victoria 3            | 529340   | ⚠️ Supported, lightly tested |
| Imperator: Rome       | 859580   | ⚠️ Supported, lightly tested |

If you find an issue with a specific game, please [open an issue](https://github.com/khoeos/paradox-translation-toolkit/issues).

## Download

Get the latest installer or the standalone version from the [release page](https://github.com/khoeos/paradox-translation-toolkit/releases).

| Platform | Format                                    | Notes                                                                                               |
| -------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Windows  | `.exe` (NSIS installer) / portable `.zip` | Primary target, fully tested. Auto-update (in progress).                                            |
| Linux    | `.AppImage` / `.deb`                      | Unsigned. Manual update, the app notifies you, downloads happen from Releases.                      |
| macOS    | `.dmg` / `.zip` (universal arm64/x64)     | Unsigned. Right-click → Open the first time. Manual update, the app notifies you, install yourself. |

The installer version creates a shortcut on your desktop and in your start menu.

> **Auto-update status**: until a Windows code-signing certificate is in place, every platform shows a notification when a new version is available and links you to the GitHub release page. No silent in-place upgrade happens, by design. See [`docs/publishing.md`](./docs/publishing.md#code-signing-strategy) for the rationale.

## How to use

1. **Select the game** you want to manage on the top
2. **Select your mod folder** from the path or using the button
3. **Pick the source language** if you want to translate from something other than English
4. **Select the target language(s)** you want to generate
5. **Select the mode** (add to current mod or extract to a separate folder)
6. **Toggle "Overwrite existing files"** if you want to force-rewrite files that already exist (the previous content is saved as `<file>.bak`)
7. **Enjoy**

The tool will check all the mods in the selected folder, and generate the missing localisation files for the selected target languages, based on the source language. Per-game settings (folders, source/target languages) are remembered automatically.

With the default options, no files will be overwritten and the tool will only generate missing files.

> Before reporting a bug, take a look at [Known issues & limitations](./docs/known-issues.md), it covers behaviours that surprise people the most (symlinks skipped, `.bak` history, per-game state, etc.).

## About the project

As a non-English player, one thing that frustrates me in Paradox games is the way translations are handled in mods. When a modder chooses to create localization files for multiple languages, if there isn't a file for your language, the game only displays the translation tags, not even the English (or any other language) text.

Even if you're proficient in English, it's more comfortable to play in your native language, especially when most of the content is translated, with only a few mods remaining in English.

To help players like me, and modders who want to be more inclusive with minimal effort, I created this app. It generates localization files for any selected language using English files (and eventually other languages in future versions).

There have been several versions leading up to the current one, and I expect to keep improving it (I'll try not to let another two years pass before the next update!).

---

## Contributing

Contributions are what make the open source community. Any contributions you make are **greatly appreciated**.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'feat: some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

Don't hesitate to pm me on discord to talk about the app. You can find my tag lower.

As a translation tool, it needs to be translated! You can find the translation files in the `packages/i18n` folder. Feel free to add your own language! See [Adding a new UI language](./docs/ui-language.md) for instructions.

More info on the code and how to contribute in the [CONTRIBUTING.md](./CONTRIBUTING.md) file.

---

## Useful links

- [App Changelog](./CHANGELOG.md)
- [Roadmap](./docs/roadmap.md)
- [Contributing guidelines](./CONTRIBUTING.md)
- [Known issues & limitations](./docs/known-issues.md)
- [Project architecture](./docs/architecture.md)
- [Building installers](./docs/building.md)
- [Testing](./docs/testing.md)
- [Releasing a new version](./docs/publishing.md)
- [Adding a new game](./docs/game-support.md)
- [Adding a new UI language](./docs/ui-language.md)

---

## Contact & Support

For questions, support, or general discussion, the fastest way to reach me is on Discord.

[![logo-discord](https://img.shields.io/badge/khoeos-grey?style=for-the-badge&logo=discord)](https://discordapp.com/users/170144954964770816)
[![logo-reddit](https://img.shields.io/badge/khoeos-grey?style=for-the-badge&logo=reddit)](https://www.reddit.com/user/khoeos/)

For bug reports and feature requests, please use [GitHub Issues](https://github.com/khoeos/paradox-translation-toolkit/issues).

For security vulnerabilities, please follow the process described in [SECURITY.md](./SECURITY.md).

Project Link: [https://github.com/khoeos/paradox-translation-toolkit](https://github.com/khoeos/paradox-translation-toolkit)

---

## License

[CC BY-NC-SA 4.0](./LICENSE.md)

> **Note:** CC BY-NC-SA 4.0 is a "source-available" license rather than a strict open-source license (the NonCommercial clause is incompatible with the OSI definition). The source remains freely readable, modifiable and shareable for non-commercial purposes.

## Disclaimer

This project, Paradox Translation Toolkit, is an open-source tool developed by the community and is not affiliated with, endorsed by, or associated with Paradox Interactive in any way. All trademarks and copyrights related to Paradox Interactive and their games are the property of their respective owners. This tool is provided as-is for the purpose of modding and translation, with no guarantees or warranties.
