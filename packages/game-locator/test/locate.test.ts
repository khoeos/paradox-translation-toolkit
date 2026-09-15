import { describe, expect, it } from 'vitest'
import type { FsLike, RegistryHive, RegistryLike } from '@ptt/shared'
import { MemoryFs } from '@ptt/converter/test/memory-fs'
import { getGame } from '@ptt/games'

import { locateGamePaths } from '../src/locate.js'

const stellaris = getGame('stellaris')
if (stellaris === undefined) {
  throw new Error('stellaris game definition not found')
}

const SHORT_SOURCE_TIMEOUT_MS = 20

const acfContent = (installDir: string): string =>
  ['"AppState"', '{', `\t"installdir"\t\t"${installDir}"`, '}'].join('\n')

const createFakeRegistry = (values: Partial<Record<string, string | undefined>>): RegistryLike => ({
  readValue: async (hive: RegistryHive, key: string, name: string) => values[`${hive}:${key}:${name}`]
})

const throwingRegistry: RegistryLike = {
  readValue: async () => {
    throw new Error('registry unavailable')
  }
}

const throwingFs: FsLike = {
  readFile: async () => {
    throw new Error('fs unavailable')
  },
  writeFile: async () => {
    throw new Error('fs unavailable')
  },
  rename: async () => {
    throw new Error('fs unavailable')
  },
  copyFile: async () => {
    throw new Error('fs unavailable')
  },
  unlink: async () => {
    throw new Error('fs unavailable')
  },
  readdir: async () => {
    throw new Error('fs unavailable')
  },
  mkdir: async () => {
    throw new Error('fs unavailable')
  },
  stat: async () => {
    throw new Error('fs unavailable')
  },
  exists: async () => {
    throw new Error('fs unavailable')
  }
}

describe('locateGamePaths', () => {
  it('resolves every source on a full win32 setup', async () => {
    const fs = new MemoryFs({
      'C:/Games/Steam/steamapps/libraryfolders.vdf': '',
      'C:/Games/Steam/steamapps/appmanifest_281990.acf': acfContent('Stellaris'),
      'C:/Games/Steam/steamapps/common/Stellaris': '',
      'C:/Games/Steam/steamapps/workshop/content/281990': '',
      '/home/user/Documents/Paradox Interactive/Stellaris/mod/some_existing_mod.mod': ''
    })
    const registry = createFakeRegistry({
      'HKCU:Software\\Valve\\Steam:SteamPath': 'C:\\Games\\Steam',
      'HKCU:Software\\GOG.com\\Games\\1508702879:path': 'C:\\Games\\Stellaris GOG'
    })

    const result = await locateGamePaths(stellaris, 'win32', '/home/user', '/home/user/Documents', fs, registry)

    expect(result.steamLibraries).toEqual(['C:/Games/Steam'])
    expect(result.installDir).toBe('C:/Games/Steam/steamapps/common/Stellaris')
    expect(result.workshopContentPaths).toEqual(['C:/Games/Steam/steamapps/workshop/content/281990'])
    expect(result.gogInstall).toBe('C:/Games/Stellaris GOG')
    expect(result.userModsFolder).toBe('/home/user/Documents/Paradox Interactive/Stellaris/mod')
  })

  it('resolves steam sources but no GOG on macOS, without querying the registry', async () => {
    const fs = new MemoryFs({
      '/home/user/Library/Application Support/Steam/steamapps/libraryfolders.vdf': '',
      '/home/user/Library/Application Support/Steam/steamapps/appmanifest_281990.acf': acfContent('Stellaris'),
      '/home/user/Library/Application Support/Steam/steamapps/common/Stellaris': '',
      '/home/user/Library/Application Support/Steam/steamapps/workshop/content/281990': '',
      '/home/user/Documents/Paradox Interactive/Stellaris/mod/some_existing_mod.mod': ''
    })
    let registryCalls = 0
    const registry: RegistryLike = {
      readValue: async () => {
        registryCalls += 1
        return undefined
      }
    }

    const result = await locateGamePaths(stellaris, 'darwin', '/home/user', '/home/user/Documents', fs, registry)

    expect(result.gogInstall).toBeUndefined()
    expect(registryCalls).toBe(0)
    expect(result.installDir).toBe('/home/user/Library/Application Support/Steam/steamapps/common/Stellaris')
    expect(result.workshopContentPaths).toEqual([
      '/home/user/Library/Application Support/Steam/steamapps/workshop/content/281990'
    ])
    expect(result.steamLibraries).toEqual(['/home/user/Library/Application Support/Steam'])
    expect(result.userModsFolder).toBe('/home/user/Documents/Paradox Interactive/Stellaris/mod')
  })

  it('returns empty arrays and no install paths when nothing is detected, and leaves userModsFolder undefined', async () => {
    const fs = new MemoryFs({})
    const registry = createFakeRegistry({})

    const result = await locateGamePaths(stellaris, 'linux', '/home/user', '/home/user/Documents', fs, registry)

    expect(result.steamLibraries).toEqual([])
    expect(result.installDir).toBeUndefined()
    expect(result.workshopContentPaths).toEqual([])
    expect(result.gogInstall).toBeUndefined()
    expect(result.userModsFolder).toBeUndefined()
  })

  it('skips the install dir and workshop lookup for a game without a steamAppId, without erroring', async () => {
    const { steamAppId: _steamAppId, ...gameWithoutSteamAppId } = stellaris
    const fs = new MemoryFs({
      'C:/Games/Steam/steamapps/libraryfolders.vdf': ''
    })
    const registry = createFakeRegistry({
      'HKCU:Software\\Valve\\Steam:SteamPath': 'C:\\Games\\Steam'
    })

    const result = await locateGamePaths(
      gameWithoutSteamAppId,
      'win32',
      '/home/user',
      '/home/user/Documents',
      fs,
      registry
    )

    expect(result.installDir).toBeUndefined()
    expect(result.workshopContentPaths).toEqual([])
    expect(result.steamLibraries).toEqual(['C:/Games/Steam'])
    expect(result.userModsFolder).toBeUndefined()
  })

  it('leaves userModsFolder undefined when the deduced mods folder does not exist on disk, while other sources stay populated', async () => {
    const fs = new MemoryFs({
      'C:/Games/Steam/steamapps/libraryfolders.vdf': '',
      'C:/Games/Steam/steamapps/appmanifest_281990.acf': acfContent('Stellaris'),
      'C:/Games/Steam/steamapps/common/Stellaris': '',
      'C:/Games/Steam/steamapps/workshop/content/281990': ''
    })
    const registry = createFakeRegistry({
      'HKCU:Software\\Valve\\Steam:SteamPath': 'C:\\Games\\Steam'
    })

    const result = await locateGamePaths(stellaris, 'win32', '/home/user', '/home/user/Documents', fs, registry)

    expect(result.steamLibraries).toEqual(['C:/Games/Steam'])
    expect(result.installDir).toBe('C:/Games/Steam/steamapps/common/Stellaris')
    expect(result.workshopContentPaths).toEqual(['C:/Games/Steam/steamapps/workshop/content/281990'])
    expect(result.userModsFolder).toBeUndefined()
  })

  it('resolves within a bounded time instead of hanging forever when fs.exists never settles', async () => {
    const hangingFs: FsLike = { ...throwingFs, exists: () => new Promise<boolean>(() => {}) }

    const result = await locateGamePaths(
      stellaris,
      'darwin',
      '/home/user',
      '/home/user/Documents',
      hangingFs,
      throwingRegistry,
      SHORT_SOURCE_TIMEOUT_MS
    )

    expect(result.steamLibraries).toEqual([])
    expect(result.installDir).toBeUndefined()
    expect(result.userModsFolder).toBeUndefined()
  })

  it('resolves within a bounded time instead of hanging forever when registry.readValue never settles', async () => {
    const hangingRegistry: RegistryLike = { readValue: () => new Promise<string | undefined>(() => {}) }

    const result = await locateGamePaths(
      stellaris,
      'win32',
      '/home/user',
      '/home/user/Documents',
      throwingFs,
      hangingRegistry,
      SHORT_SOURCE_TIMEOUT_MS
    )

    expect(result.steamLibraries).toEqual([])
    expect(result.gogInstall).toBeUndefined()
    expect(result.userModsFolder).toBeUndefined()
  })

  it('leaves userModsFolder undefined instead of rejecting when documentsPath is not a string', async () => {
    const hostileDocumentsPath = JSON.parse('null')

    const result = await locateGamePaths(
      stellaris,
      'darwin',
      '/home/user',
      hostileDocumentsPath,
      throwingFs,
      throwingRegistry
    )

    expect(result.userModsFolder).toBeUndefined()
  })

  it('never rejects even when the fs and registry throw on every call', async () => {
    const result = await locateGamePaths(
      stellaris,
      'win32',
      '/home/user',
      '/home/user/Documents',
      throwingFs,
      throwingRegistry
    )

    expect(result.steamLibraries).toEqual([])
    expect(result.installDir).toBeUndefined()
    expect(result.workshopContentPaths).toEqual([])
    expect(result.gogInstall).toBeUndefined()
    expect(result.userModsFolder).toBeUndefined()
  })

  it('prefers the launcher-settings.json gameDataPath over the deduced mods folder, and exposes declaredGameId and executablePath', async () => {
    const installDir = '/home/user/Library/Application Support/Steam/steamapps/common/Stellaris'
    const launcherSettings = JSON.stringify({
      distPlatform: 'steam',
      exePath: './stellaris.app/Contents/MacOS/stellaris',
      gameDataPath: '~/Documents/Paradox Interactive/Stellaris Renamed',
      gameId: 'stellaris',
      modsCompatibilityVersion: '4.4',
      rawVersion: 'v4.4.6'
    })
    const fs = new MemoryFs({
      '/home/user/Library/Application Support/Steam/steamapps/libraryfolders.vdf': '',
      '/home/user/Library/Application Support/Steam/steamapps/appmanifest_281990.acf': acfContent('Stellaris'),
      [`${installDir}/launcher-settings.json`]: launcherSettings,
      [`${installDir}/stellaris.app/Contents/MacOS/stellaris`]: '',
      '/home/user/Documents/Paradox Interactive/Stellaris Renamed/mod/some_existing_mod.mod': ''
    })
    const registry = createFakeRegistry({})

    const result = await locateGamePaths(stellaris, 'darwin', '/home/user', '/home/user/Documents', fs, registry)

    expect(result.installDir).toBe(installDir)
    expect(result.userModsFolder).toBe('/home/user/Documents/Paradox Interactive/Stellaris Renamed/mod')
    expect(result.declaredGameId).toBe('stellaris')
    expect(result.executablePath).toBe(`${installDir}/stellaris.app/Contents/MacOS/stellaris`)
  })

  it('omits executablePath when the declared exePath does not exist on disk, without dropping installDir', async () => {
    const installDir = '/home/user/Library/Application Support/Steam/steamapps/common/Stellaris'
    const launcherSettings = JSON.stringify({
      exePath: './stellaris.app/Contents/MacOS/stellaris',
      gameDataPath: '~/Documents/Paradox Interactive/Stellaris',
      gameId: 'stellaris'
    })
    const fs = new MemoryFs({
      '/home/user/Library/Application Support/Steam/steamapps/libraryfolders.vdf': '',
      '/home/user/Library/Application Support/Steam/steamapps/appmanifest_281990.acf': acfContent('Stellaris'),
      [`${installDir}/launcher-settings.json`]: launcherSettings,
      '/home/user/Documents/Paradox Interactive/Stellaris/mod/some_existing_mod.mod': ''
    })
    const registry = createFakeRegistry({})

    const result = await locateGamePaths(stellaris, 'darwin', '/home/user', '/home/user/Documents', fs, registry)

    expect(result.installDir).toBe(installDir)
    expect(result.executablePath).toBeUndefined()
    expect(result.userModsFolder).toBe('/home/user/Documents/Paradox Interactive/Stellaris/mod')
  })

  it('falls back to the deduced mods folder when launcher-settings.json is absent, and resolves it when it exists on disk', async () => {
    const installDir = '/home/user/Library/Application Support/Steam/steamapps/common/Stellaris'
    const fs = new MemoryFs({
      '/home/user/Library/Application Support/Steam/steamapps/libraryfolders.vdf': '',
      '/home/user/Library/Application Support/Steam/steamapps/appmanifest_281990.acf': acfContent('Stellaris'),
      [installDir]: '',
      '/home/user/Documents/Paradox Interactive/Stellaris/mod/some_existing_mod.mod': ''
    })
    const registry = createFakeRegistry({})

    const result = await locateGamePaths(stellaris, 'darwin', '/home/user', '/home/user/Documents', fs, registry)

    expect(result.installDir).toBe(installDir)
    expect(result.declaredGameId).toBeUndefined()
    expect(result.executablePath).toBeUndefined()
    expect(result.userModsFolder).toBe('/home/user/Documents/Paradox Interactive/Stellaris/mod')
  })

  it('falls back to the deduced mods folder when the declared gameDataPath has an unresolved token', async () => {
    const installDir = '/home/user/Library/Application Support/Steam/steamapps/common/Stellaris'
    const launcherSettings = JSON.stringify({
      exePath: './stellaris.app/Contents/MacOS/stellaris',
      gameDataPath: '%SOME_UNKNOWN_TOKEN%/Paradox Interactive/Stellaris',
      gameId: 'stellaris'
    })
    const fs = new MemoryFs({
      '/home/user/Library/Application Support/Steam/steamapps/libraryfolders.vdf': '',
      '/home/user/Library/Application Support/Steam/steamapps/appmanifest_281990.acf': acfContent('Stellaris'),
      [`${installDir}/launcher-settings.json`]: launcherSettings,
      '/home/user/Documents/Paradox Interactive/Stellaris/mod/some_existing_mod.mod': ''
    })
    const registry = createFakeRegistry({})

    const result = await locateGamePaths(stellaris, 'darwin', '/home/user', '/home/user/Documents', fs, registry)

    expect(result.userModsFolder).toBe('/home/user/Documents/Paradox Interactive/Stellaris/mod')
    expect(result.declaredGameId).toBe('stellaris')
  })
})
