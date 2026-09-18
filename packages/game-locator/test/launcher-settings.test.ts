import { describe, expect, it } from 'vitest'

import { MemoryFs } from '@ptt/converter/test/memory-fs'
import type { FsLike } from '@ptt/shared'

import {
  expandGameDataPath,
  parseLauncherSettings,
  readLauncherSettings,
  resolveExecutablePath
} from '../src/launcher-settings.js'

const eu4LauncherSettings = JSON.stringify({
  gameId: 'eu4',
  displayName: 'Europa Universalis IV',
  distPlatform: 'steam',
  exePath: './eu4.app/Contents/MacOS/eu4',
  exeArgs: ['-enabletelemetry', '-gdpr-compliant'],
  gameDataPath: '~/Documents/Paradox Interactive/Europa Universalis IV',
  rawVersion: 'v1.37.5.0',
  version: 'EU4 v1.37.5.0 Inca (491d)'
})

const stellarisLauncherSettings = JSON.stringify({
  distPlatform: 'steam',
  exePath: './stellaris.app/Contents/MacOS/stellaris',
  alternativeExecutables: [{}],
  gameDataPath: '~/Documents/Paradox Interactive/Stellaris',
  gameId: 'stellaris',
  modsCompatibilityVersion: '4.4',
  rawVersion: 'v4.4.6'
})

const trackingFs = (fs: FsLike): { fs: FsLike; getReadFileCalls: () => number } => {
  let readFileCalls = 0
  const wrapped: FsLike = {
    readFile: async (path, encoding) => {
      readFileCalls += 1
      return fs.readFile(path, encoding)
    },
    writeFile: (path, data, encoding) => fs.writeFile(path, data, encoding),
    rename: (from, to) => fs.rename(from, to),
    copyFile: (from, to) => fs.copyFile(from, to),
    unlink: path => fs.unlink(path),
    readdir: path => fs.readdir(path),
    mkdir: (path, opts) => fs.mkdir(path, opts),
    stat: path => fs.stat(path),
    exists: path => fs.exists(path)
  }
  return { fs: wrapped, getReadFileCalls: () => readFileCalls }
}

describe('parseLauncherSettings', () => {
  it('parses the real Europa Universalis IV launcher-settings.json shape', () => {
    const settings = parseLauncherSettings(eu4LauncherSettings)

    expect(settings).toEqual({
      gameId: 'eu4',
      gameDataPath: '~/Documents/Paradox Interactive/Europa Universalis IV',
      exePath: './eu4.app/Contents/MacOS/eu4'
    })
  })

  it('parses the real Stellaris launcher-settings.json shape, where displayName is absent', () => {
    const settings = parseLauncherSettings(stellarisLauncherSettings)

    expect(settings).toEqual({
      gameId: 'stellaris',
      gameDataPath: '~/Documents/Paradox Interactive/Stellaris',
      exePath: './stellaris.app/Contents/MacOS/stellaris'
    })
  })

  it('returns undefined for invalid JSON', () => {
    expect(parseLauncherSettings('{not json')).toBeUndefined()
  })

  it('returns undefined for a JSON value that is not an object', () => {
    expect(parseLauncherSettings('42')).toBeUndefined()
  })

  it('omits gameDataPath when absent from the file', () => {
    const settings = parseLauncherSettings(
      JSON.stringify({ gameId: 'stellaris', exePath: './stellaris' })
    )

    expect(settings).toEqual({ gameId: 'stellaris', exePath: './stellaris' })
  })
})

describe('readLauncherSettings', () => {
  it('finds the file at the root of the install directory', async () => {
    const fs = new MemoryFs({
      '/install/launcher-settings.json': stellarisLauncherSettings
    })

    const settings = await readLauncherSettings('/install', fs)

    expect(settings?.gameId).toBe('stellaris')
  })

  it('falls back to launcher/launcher-settings.json when the root file is absent', async () => {
    const fs = new MemoryFs({
      '/install/launcher/launcher-settings.json': eu4LauncherSettings
    })

    const settings = await readLauncherSettings('/install', fs)

    expect(settings?.gameId).toBe('eu4')
  })

  it('returns undefined when neither location has a launcher-settings.json', async () => {
    const fs = new MemoryFs({})

    const settings = await readLauncherSettings('/install', fs)

    expect(settings).toBeUndefined()
  })

  it('returns undefined for invalid JSON at both locations, without throwing', async () => {
    const fs = new MemoryFs({
      '/install/launcher-settings.json': '{not json',
      '/install/launcher/launcher-settings.json': 'also not json'
    })

    const settings = await readLauncherSettings('/install', fs)

    expect(settings).toBeUndefined()
  })

  it('skips a file larger than the size cap without reading it in full', async () => {
    const oversized = JSON.stringify({ gameId: 'x'.repeat(300_000) })
    const fs = new MemoryFs({ '/install/launcher-settings.json': oversized })
    const { fs: tracked, getReadFileCalls } = trackingFs(fs)

    const settings = await readLauncherSettings('/install', tracked)

    expect(settings).toBeUndefined()
    expect(getReadFileCalls()).toBe(0)
  })
})

describe('expandGameDataPath', () => {
  const home = '/home/user'
  const documentsPath = '/home/user/Documents'
  const localDataHome = '/home/user/.local/share'

  it('expands a leading ~ using the home directory, matching the macOS shape', () => {
    const result = expandGameDataPath(
      '~/Documents/Paradox Interactive/Stellaris',
      home,
      documentsPath,
      localDataHome
    )

    expect(result).toBe('/home/user/Documents/Paradox Interactive/Stellaris')
  })

  it('expands the %USER_DOCUMENTS% token, matching the reported Windows shape', () => {
    const result = expandGameDataPath(
      '%USER_DOCUMENTS%\\Paradox Interactive\\Europa Universalis IV',
      home,
      documentsPath,
      localDataHome
    )

    expect(result).toBe('/home/user/Documents/Paradox Interactive/Europa Universalis IV')
  })

  it('expands the $LINUX_DATA_HOME token, matching the reported Linux shape', () => {
    const result = expandGameDataPath(
      '$LINUX_DATA_HOME/Paradox Interactive/Stellaris',
      home,
      documentsPath,
      localDataHome
    )

    expect(result).toBe('/home/user/.local/share/Paradox Interactive/Stellaris')
  })

  it('returns undefined when an unknown token remains unresolved', () => {
    const result = expandGameDataPath(
      '%SOME_UNKNOWN_TOKEN%/Paradox Interactive/Stellaris',
      home,
      documentsPath,
      localDataHome
    )

    expect(result).toBeUndefined()
  })
})

describe('resolveExecutablePath', () => {
  it('resolves a relative ./ exePath against the install directory, matching the real EU4 and Stellaris shapes', () => {
    expect(resolveExecutablePath('/install/eu4', './eu4.app/Contents/MacOS/eu4')).toBe(
      '/install/eu4/eu4.app/Contents/MacOS/eu4'
    )
    expect(
      resolveExecutablePath('/install/stellaris', './stellaris.app/Contents/MacOS/stellaris')
    ).toBe('/install/stellaris/stellaris.app/Contents/MacOS/stellaris')
  })
})
