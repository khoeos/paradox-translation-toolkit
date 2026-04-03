[![stars-shield](https://img.shields.io/github/stars/Khoeos/Paradox-mod-language-converter.svg?style=for-the-badge)](https://github.com/Khoeos/Paradox-mod-language-converter/stargazers)
[![contributors-shield](https://img.shields.io/github/contributors/Khoeos/Paradox-mod-language-converter.svg?style=for-the-badge)](https://github.com/Khoeos/Paradox-mod-language-converter/graphs/contributors)
[![issues-shield](https://img.shields.io/github/issues/Khoeos/Paradox-mod-language-converter.svg?style=for-the-badge)](https://github.com/Khoeos/Paradox-mod-language-converter/issues)
[![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey.svg?style=for-the-badge)](https://creativecommons.org/licenses/by-nc-sa/4.0/)

<h1 align="center">Paradox Translation Toolkit</h1>

<a href="https://github.com/khoeos/Paradox-mod-language-converter">
    <img src="https://github.com/khoeos/Paradox-mod-language-converter/blob/main/screenshots/1.png?raw=true" alt="Logo">
  </a>

  <p align="center">
    The easiest way to manage your missing translation files for Paradox games (and more).
    <br />
    <a href="https://github.com/khoeos/Paradox-mod-language-converter/releases"><strong>Download App »</strong></a>
    <br/>
    <br/>
    <a href="https://github.com/khoeos/Paradox-mod-language-converter">Explore the docs »</a>
    <br />
    <br />
    <a href="https://github.com/khoeos/Paradox-mod-language-converter/issues">Report Bug</a>
    ·
    <a href="https://github.com/khoeos/Paradox-mod-language-converter/issues">Request Feature</a>
  </p>
</p>

<!-- TABLE OF CONTENTS -->
<details open="open">
  <summary><h2 style="display: inline-block">Table of Contents</h2></summary>
  <ol>
    <li>
      <a href="#how-to-use">How to use</a>
    </li>
    <li>
      <a href="#about-the-project">About the project</a>
    </li>
    <li><a href="#contributing">Contributing</a></li>
    <li><a href="#todo">Todo</a></li>
    <li><a href="#license">License</a></li>
    <li><a href="#contact">Contact</a></li>
    <li><a href="#project-setup">Project Setup</a></li>

  </ol>
</details>

## Main functionnalities

- Generate missing localisation files for any language
- Generate files directly in the mod folder or in a custom folder
- View all the missing files, and acess it directly
- Working with multiple paradox games

⚠️ **The tool is in active development, the new version is quite recent and based on the first one but without an extensive testing in every games and every cases, you may encounter some errors, [you can check the V1 for a more stable version](https://github.com/khoeos/Paradox-mod-language-converter/releases/tag/1.0.0) but there is also some known error that are fixed in the last vesion (you have to make a choice 🤡)**

### Coming soon

- Opt-in each file to generate
- Deep check in the files for missing keys
- Extract automatically the missing files into a new custom mod
- Manage translation files (missing keys, side by side view, etc)

## How to use

### 1. **Download and install the app from the** [release page](https://github.com/khoeos/Paradox-mod-language-converter/releases)

You can use the standalone version, or the installer version. The installer version will create a shortcut on your desktop and in your start menu.

### 2. **Select the game you want to manage on the top**

### 3. **Select your mod folder from the path or using the button**

### 4. **Select the language(s) you want to generate**

### 5. **Select the mode**

### 6. **Change the options if you need**

### 7. **Enjoy**

The tool will check all the mods in the selected folder, and generate the missing localisation files for the selected languages, based on the source language (english by default).

With the default options, no files will be overwritten, and the tool will only generate missing files.

The tool is mainly tested with Stellaris, but it should work with all Paradox games. But some parameters may be different from one game to another. If you have any issue, please report it.

Only tested on windows. It may work on other plaforms you can build it yourself, but i can't guarantee it will work.

<details>
  <summary><h2 style="display: inline-block">How it work</h2></summary>
  <p>I've tried to comment every function I've used and/or use explicit naming so you can easily check the code.</p>
<p>In brief, using the default functions and options, I have a script that parses all the files in all folders within a directory and filters out only the translation files: specifically, the .yml files located in the localization directory of the selected game.</p>
<p>For each file, it extracts the file paths from the source language and compares them to the file paths of the output language.</p>
<p>If the file doesn't exist, the script will copy the source file, replace the language keys in both the file content and the filename with the targeted language, and create the new file in the corresponding location.</p>
<p>For the "deep check" option I have planned: if the file exists in the targeted language, the script will read it and check for any missing keys that are present in the source file but not in the target file. However, this will require more parsing, so it's not for today.</p>

</details>

## About the project

As a non-English player, one thing that frustrates me in Paradox games is the way translations are handled in mods. When a modder chooses to create localization files for multiple languages, if there isn't a file for your language, the game only displays the translation tags, not even the English (or any other language) text.

Even if you're proficient in English, it's more comfortable to play in your native language, especially when most of the content is translated, with only a few mods remaining in English.

To help players like me, and modders who want to be more inclusive with minimal effort, I created this app. It generates localization files for any selected language using English files (and eventually other languages in future versions).

There have been several versions leading up to the current one, and I expect to keep improving it (I’ll try not to let another two years pass before the next update!).

## Contributing

Contributions are what make the open source community. Any contributions you make are **greatly appreciated**.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

Don't hesitate to pm me on discord to talk about the app. You can find my tag lower.

As a translation tool, it need to be translated ! you can find the translation files in `src/i18n` folder. Feel free to add your own language !

## Todo

- Manage incomplete files (missing translation tag for example)
- Manage files with replace (don't remember why i've excluded these files)

See the [open issues](https://github.com/Khoeos/Paradox-mod-localisation-converter/issues) for a list of proposed features (and known issues).

## License

This project is licensed under the [Creative Commons Attribution - NonCommercial - ShareAlike 4.0 International](https://creativecommons.org/licenses/by-nc-sa/4.0/) license. You are free to share and adapt the content as long as proper attribution is given, it is not used for commercial purposes, and any derivative works are shared under the same license.

## Contact

[![logo-discord](https://img.shields.io/badge/khoeos-grey?style=for-the-badge&logo=discord)](https://discordapp.com/users/170144954964770816)
[![logo-reddit](https://img.shields.io/badge/khoeos-grey?style=for-the-badge&logo=reddit)](https://www.reddit.com/user/khoeos/)

Project Link: [https://github.com/khoeos/Paradox-mod-language-converter](https://github.com/khoeos/Paradox-mod-language-converter)

## Project Setup

Install [Node.js](https://nodejs.org/en/download)

### Recommended IDE Setup

- [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

### Install

```bash
$ npm install
```

### Development

```bash
$ npm run dev
```

### Build

```bash
# For windows
$ npm run build:win

# For macOS
$ npm run build:mac

# For Linux
$ npm run build:linux
```
## Disclaimer

This project, Paradox Translation Toolkit, is an open-source tool developed by the community and is not affiliated with, endorsed by, or associated with Paradox Interactive in any way. All trademarks and copyrights related to Paradox Interactive and their games are the property of their respective owners. This tool is provided as-is for the purpose of modding and translation, with no guarantees or warranties.

