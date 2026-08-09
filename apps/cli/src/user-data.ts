import { homedir } from 'node:os'

import { posixJoin } from '@ptt/converter'

/**
 * The folders Electron resolves through `app.getPath`, resolved here by hand.
 *
 * Ported from PR #4 (e21ee7a, `src/cli/options.ts`) by Artem Kondrashev, with the macOS case fixed:
 * the original only covered Windows (`APPDATA`) and Linux (`~/.config`), so on macOS the CLI built
 * its own userData folder next to the app's real one and the two never shared a translation memory,
 * a glossary or a report.
 */

/** The name Electron derives the userData folder from: the productName of the desktop app. */
export const APP_FOLDER = 'Paradox Translation Toolkit'

/**
 * Where the app keeps its data on this platform.
 * @param platform - Normally `process.platform`; a parameter so the mapping is testable
 * @param env - Normally `process.env`
 * @param home - Normally `os.homedir()`
 * @returns The same folder `app.getPath('userData')` returns in the desktop app
 */
export function defaultUserDataPath(
  platform: NodeJS.Platform,
  env: Record<string, string | undefined>,
  home: string
): string {
  if (platform === 'win32') {
    const appData = env.APPDATA ?? posixJoin(home, 'AppData/Roaming')
    return posixJoin(appData, APP_FOLDER)
  }
  if (platform === 'darwin') {
    return posixJoin(home, 'Library/Application Support', APP_FOLDER)
  }
  const configHome = env.XDG_CONFIG_HOME ?? posixJoin(home, '.config')
  return posixJoin(configHome, APP_FOLDER)
}

/** Where the generated mod goes, which is under Documents on every platform. */
export function defaultDocumentsPath(home: string): string {
  return posixJoin(home, 'Documents')
}

export function resolveUserData(explicit?: string): string {
  // An explicit empty string is a mistake, not a request to use the working directory: that is
  // what turned `--user-data ''` into a delete of a cwd-relative folder (audit finding S-16).
  if (explicit !== undefined && explicit.trim().length > 0) return explicit
  return defaultUserDataPath(process.platform, process.env, homedir())
}

export function resolveDocuments(explicit?: string): string {
  if (explicit !== undefined && explicit.trim().length > 0) return explicit
  return defaultDocumentsPath(homedir())
}
