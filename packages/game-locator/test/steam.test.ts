import { describe, expect, it } from 'vitest'

import { MemoryFs } from '@ptt/converter/test/memory-fs'
import type { FsLike, RegistryHive, RegistryLike } from '@ptt/shared'

import {
  findGameInstallDir,
  findLibraryFolders,
  findSteamRoot,
  findWorkshopContentDir
} from '../src/steam.js'

const STELLARIS_APP_ID = 281_990

const createFakeRegistry = (values: Partial<Record<string, string | undefined>>): RegistryLike => ({
  readValue: async (hive: RegistryHive, key: string, name: string) =>
    values[`${hive}:${key}:${name}`]
})

const acfContent = (installDir: string): string =>
  ['"AppState"', '{', `\t"installdir"\t\t"${installDir}"`, '}'].join('\n')

describe('findSteamRoot', () => {
  it('resolves via HKCU on win32', async () => {
    const fs = new MemoryFs({ 'C:/Games/Steam/steamapps/libraryfolders.vdf': '' })
    const registry = createFakeRegistry({
      'HKCU:Software\\Valve\\Steam:SteamPath': 'C:\\Games\\Steam'
    })

    const result = await findSteamRoot('win32', '/home/user', fs, registry)

    expect(result).toBe('C:/Games/Steam')
  })

  it('falls back to HKLM on win32 when HKCU has no value', async () => {
    const fs = new MemoryFs({ 'D:/Steam/steamapps/libraryfolders.vdf': '' })
    const registry = createFakeRegistry({
      'HKLM:Software\\Valve\\Steam:SteamPath': 'D:\\Steam'
    })

    const result = await findSteamRoot('win32', '/home/user', fs, registry)

    expect(result).toBe('D:/Steam')
  })

  it('falls back to the default win32 path when the registry has no value', async () => {
    const fs = new MemoryFs({ 'C:/Program Files (x86)/Steam/steamapps/libraryfolders.vdf': '' })
    const registry = createFakeRegistry({})

    const result = await findSteamRoot('win32', '/home/user', fs, registry)

    expect(result).toBe('C:/Program Files (x86)/Steam')
  })

  it('returns undefined on win32 when nothing exists', async () => {
    const fs = new MemoryFs({})
    const registry = createFakeRegistry({})

    const result = await findSteamRoot('win32', '/home/user', fs, registry)

    expect(result).toBeUndefined()
  })

  it('resolves the macOS root when it exists', async () => {
    const fs = new MemoryFs({
      '/home/user/Library/Application Support/Steam/steamapps/libraryfolders.vdf': ''
    })
    const registry = createFakeRegistry({})

    const result = await findSteamRoot('darwin', '/home/user', fs, registry)

    expect(result).toBe('/home/user/Library/Application Support/Steam')
  })

  it('resolves the native linux root when it exists', async () => {
    const fs = new MemoryFs({ '/home/user/.local/share/Steam/steamapps/libraryfolders.vdf': '' })
    const registry = createFakeRegistry({})

    const result = await findSteamRoot('linux', '/home/user', fs, registry)

    expect(result).toBe('/home/user/.local/share/Steam')
  })

  it('falls back to the Flatpak linux root when the native one is absent', async () => {
    const fs = new MemoryFs({
      '/home/user/.var/app/com.valvesoftware.Steam/.local/share/Steam/steamapps/libraryfolders.vdf':
        ''
    })
    const registry = createFakeRegistry({})

    const result = await findSteamRoot('linux', '/home/user', fs, registry)

    expect(result).toBe('/home/user/.var/app/com.valvesoftware.Steam/.local/share/Steam')
  })
})

describe('findLibraryFolders', () => {
  it('parses the recent libraryfolders.vdf format and always includes steamRoot', async () => {
    const content = [
      '"libraryfolders"',
      '{',
      '\t"0"',
      '\t{',
      '\t\t"path"\t\t"/mnt/steam-lib"',
      '\t}',
      '}'
    ].join('\n')
    const fs = new MemoryFs({ '/steamroot/config/libraryfolders.vdf': content })

    const result = await findLibraryFolders('/steamroot', fs)

    expect(result).toEqual(['/steamroot', '/mnt/steam-lib'])
  })

  it('falls back to the old libraryfolders.vdf format when the recent one is absent', async () => {
    const content = [
      '"LibraryFolders"',
      '{',
      '\t"TimeNextStatsReport"\t\t"1700000000"',
      '\t"ContentStatsID"\t\t"-1234567890"',
      '\t"1"\t\t"/mnt/old-lib"',
      '}'
    ].join('\n')
    const fs = new MemoryFs({ '/steamroot/steamapps/libraryfolders.vdf': content })

    const result = await findLibraryFolders('/steamroot', fs)

    expect(result).toEqual(['/steamroot', '/mnt/old-lib'])
  })

  it('does not fall back to the old format when the recent one has entries', async () => {
    const newContent = [
      '"libraryfolders"',
      '{',
      '\t"0"',
      '\t{',
      '\t\t"path"\t\t"/mnt/new-lib"',
      '\t}',
      '}'
    ].join('\n')
    const oldContent = ['"LibraryFolders"', '{', '\t"1"\t\t"/mnt/old-lib"', '}'].join('\n')
    const fs = new MemoryFs({
      '/steamroot/config/libraryfolders.vdf': newContent,
      '/steamroot/steamapps/libraryfolders.vdf': oldContent
    })

    const result = await findLibraryFolders('/steamroot', fs)

    expect(result).toEqual(['/steamroot', '/mnt/new-lib'])
  })

  it('includes BaseInstallFolder_* entries from config.vdf', async () => {
    const configContent = [
      '"InstallConfigStore"',
      '{',
      '\t"Software"',
      '\t{',
      '\t\t"Valve"',
      '\t\t{',
      '\t\t\t"Steam"',
      '\t\t\t{',
      '\t\t\t\t"BaseInstallFolder_1"\t\t"/mnt/config-lib-1"',
      '\t\t\t\t"BaseInstallFolder_2"\t\t"/mnt/config-lib-2"',
      '\t\t\t}',
      '\t\t}',
      '\t}',
      '}'
    ].join('\n')
    const fs = new MemoryFs({ '/steamroot/config/config.vdf': configContent })

    const result = await findLibraryFolders('/steamroot', fs)

    expect(result).toEqual(['/steamroot', '/mnt/config-lib-1', '/mnt/config-lib-2'])
  })

  it('deduplicates libraries found in multiple sources', async () => {
    const configContent = [
      '"InstallConfigStore"',
      '{',
      '\t"Software"',
      '\t{',
      '\t\t"Valve"',
      '\t\t{',
      '\t\t\t"Steam"',
      '\t\t\t{',
      '\t\t\t\t"BaseInstallFolder_1"\t\t"/mnt/shared-lib"',
      '\t\t\t}',
      '\t\t}',
      '\t}',
      '}'
    ].join('\n')
    const newContent = [
      '"libraryfolders"',
      '{',
      '\t"0"',
      '\t{',
      '\t\t"path"\t\t"/mnt/shared-lib"',
      '\t}',
      '}'
    ].join('\n')
    const fs = new MemoryFs({
      '/steamroot/config/config.vdf': configContent,
      '/steamroot/config/libraryfolders.vdf': newContent
    })

    const result = await findLibraryFolders('/steamroot', fs)

    expect(result).toEqual(['/steamroot', '/mnt/shared-lib'])
  })

  it('returns only steamRoot when no vdf file is present', async () => {
    const fs = new MemoryFs({})

    const result = await findLibraryFolders('/steamroot', fs)

    expect(result).toEqual(['/steamroot'])
  })

  it('deduplicates the same Windows library reached with different casing', async () => {
    const content = [
      '"libraryfolders"',
      '{',
      '\t"0"',
      '\t{',
      '\t\t"path"\t\t"D:\\\\Games\\\\SteamLibrary"',
      '\t}',
      '\t"1"',
      '\t{',
      '\t\t"path"\t\t"d:\\\\GAMES\\\\steamlibrary"',
      '\t}',
      '}'
    ].join('\n')
    const fs = new MemoryFs({ 'C:/Games/Steam/config/libraryfolders.vdf': content })

    const result = await findLibraryFolders('C:/Games/Steam', fs)

    expect(result).toEqual(['C:/Games/Steam', 'D:/Games/SteamLibrary'])
  })

  it('normalizes a Windows-style steamRoot with backslashes', async () => {
    const content = [
      '"libraryfolders"',
      '{',
      '\t"0"',
      '\t{',
      '\t\t"path"\t\t"D:\\\\SteamLibrary"',
      '\t}',
      '}'
    ].join('\n')
    const fs = new MemoryFs({ 'C:/Games/Steam/config/libraryfolders.vdf': content })

    const result = await findLibraryFolders('C:\\Games\\Steam', fs)

    expect(result).toEqual(['C:/Games/Steam', 'D:/SteamLibrary'])
  })
})

describe('findGameInstallDir', () => {
  it('finds the game in the second library when the first has no manifest', async () => {
    const fs = new MemoryFs({
      '/lib-2/steamapps/appmanifest_281990.acf': acfContent('Stellaris'),
      '/lib-2/steamapps/common/Stellaris/stellaris.exe': ''
    })

    const result = await findGameInstallDir(['/lib-1', '/lib-2'], STELLARIS_APP_ID, fs)

    expect(result).toBe('/lib-2/steamapps/common/Stellaris')
  })

  it('does not retain a manifest whose common directory no longer exists', async () => {
    const fs = new MemoryFs({
      '/lib-1/steamapps/appmanifest_281990.acf': acfContent('Stellaris')
    })

    const result = await findGameInstallDir(['/lib-1'], STELLARIS_APP_ID, fs)

    expect(result).toBeUndefined()
  })

  it('returns undefined when no library has a manifest', async () => {
    const fs = new MemoryFs({})

    const result = await findGameInstallDir(['/lib-1'], STELLARIS_APP_ID, fs)

    expect(result).toBeUndefined()
  })

  it('rejects an installdir containing ".." instead of resolving outside the library', async () => {
    const fs = new MemoryFs({
      '/lib-1/steamapps/appmanifest_281990.acf': acfContent('../../../secret-outside'),
      '/secret-outside/marker.txt': 'should never be reachable'
    })

    const result = await findGameInstallDir(['/lib-1'], STELLARIS_APP_ID, fs)

    expect(result).toBeUndefined()
  })

  it('rejects an empty installdir instead of resolving to the shared "common" directory', async () => {
    const fs = new MemoryFs({
      '/lib-1/steamapps/appmanifest_281990.acf': acfContent(''),
      '/lib-1/steamapps/common/.marker': 'x'
    })

    const result = await findGameInstallDir(['/lib-1'], STELLARIS_APP_ID, fs)

    expect(result).toBeUndefined()
  })

  it('moves on to the next library when the first has a manifest whose target directory is absent', async () => {
    const fs = new MemoryFs({
      '/lib-1/steamapps/appmanifest_281990.acf': acfContent('Stellaris'),
      '/lib-2/steamapps/appmanifest_281990.acf': acfContent('Stellaris'),
      '/lib-2/steamapps/common/Stellaris/stellaris.exe': ''
    })

    const result = await findGameInstallDir(['/lib-1', '/lib-2'], STELLARIS_APP_ID, fs)

    expect(result).toBe('/lib-2/steamapps/common/Stellaris')
  })

  it('skips a manifest larger than the parser size cap without reading it in full', async () => {
    const oversizedInstallDir = 'x'.repeat(300_000)
    const fs = new MemoryFs({
      '/lib-1/steamapps/appmanifest_281990.acf': acfContent(oversizedInstallDir)
    })
    let readFileCalls = 0
    const trackingFs: FsLike = {
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

    const result = await findGameInstallDir(['/lib-1'], STELLARIS_APP_ID, trackingFs)

    expect(result).toBeUndefined()
    expect(readFileCalls).toBe(0)
  })
})

describe('findWorkshopContentDir', () => {
  it('returns only the libraries where the workshop content directory exists', async () => {
    const fs = new MemoryFs({
      '/lib-1/steamapps/workshop/content/281990/mod-file.txt': ''
    })

    const result = await findWorkshopContentDir(['/lib-1', '/lib-2'], STELLARIS_APP_ID, fs)

    expect(result).toEqual(['/lib-1/steamapps/workshop/content/281990'])
  })

  it('deduplicates results', async () => {
    const fs = new MemoryFs({
      '/lib-1/steamapps/workshop/content/281990/mod-file.txt': ''
    })

    const result = await findWorkshopContentDir(['/lib-1', '/lib-1'], STELLARIS_APP_ID, fs)

    expect(result).toEqual(['/lib-1/steamapps/workshop/content/281990'])
  })
})
