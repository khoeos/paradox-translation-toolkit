import { homedir } from 'node:os'

import type { LocatedPaths } from '@ptt/game-locator'
import type { FsLike, RegistryLike } from '@ptt/shared'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: vi.fn(() => '/tmp/ptt-test') } }))

import { GameLocatorService, type LocateGamePathsFn } from './game-locator-service.js'

const notImplemented = (): never => {
  throw new Error('not implemented in this test')
}

const stubFs: FsLike = {
  readFile: notImplemented,
  writeFile: notImplemented,
  rename: notImplemented,
  copyFile: notImplemented,
  unlink: notImplemented,
  readdir: notImplemented,
  mkdir: notImplemented,
  stat: notImplemented,
  exists: notImplemented
}

const stubRegistry: RegistryLike = {
  readValue: notImplemented
}

const makeService = (locate: LocateGamePathsFn): GameLocatorService =>
  new GameLocatorService(homedir(), '/mnt/user/Documents', stubFs, stubRegistry, locate)

describe('GameLocatorService', () => {
  it('rejects an unknown game id', async () => {
    const locate = vi.fn<LocateGamePathsFn>()
    const service = makeService(locate)
    await expect(service.locateGame('not-a-real-game')).rejects.toThrow(/Unknown game id/)
    expect(locate).not.toHaveBeenCalled()
  })

  it('rejects when the documents folder is unavailable', async () => {
    const locate = vi.fn<LocateGamePathsFn>()
    const service = new GameLocatorService(homedir(), undefined, stubFs, stubRegistry, locate)
    await expect(service.locateGame('stellaris')).rejects.toThrow(/Documents folder/)
    expect(locate).not.toHaveBeenCalled()
  })

  it('strips a critical userModsFolder out of the result', async () => {
    const locate = vi.fn<LocateGamePathsFn>(async () => ({
      workshopContentPaths: [],
      userModsFolder: homedir(),
      steamLibraries: []
    }))
    const service = makeService(locate)

    const result = await service.locateGame('stellaris')

    expect(result.userModsFolder).toBeUndefined()
  })

  it('strips a critical installDir and gogInstall out of the result', async () => {
    const locate = vi.fn<LocateGamePathsFn>(async () => ({
      installDir: homedir(),
      workshopContentPaths: [],
      userModsFolder: '/mnt/user/Documents/Paradox Interactive/Stellaris/mod',
      gogInstall: homedir(),
      steamLibraries: []
    }))
    const service = makeService(locate)

    const result = await service.locateGame('stellaris')

    expect(result.installDir).toBeUndefined()
    expect(result.gogInstall).toBeUndefined()
    expect(result.userModsFolder).toBe('/mnt/user/Documents/Paradox Interactive/Stellaris/mod')
  })

  it('strips a critical executablePath but keeps declaredGameId, an information field, untouched', async () => {
    const locate = vi.fn<LocateGamePathsFn>(async () => ({
      workshopContentPaths: [],
      userModsFolder: '/mnt/user/Documents/Paradox Interactive/Stellaris/mod',
      steamLibraries: [],
      declaredGameId: 'stellaris',
      executablePath: homedir()
    }))
    const service = makeService(locate)

    const result = await service.locateGame('stellaris')

    expect(result.executablePath).toBeUndefined()
    expect(result.declaredGameId).toBe('stellaris')
  })

  it('filters critical entries out of workshopContentPaths and steamLibraries', async () => {
    const safeWorkshopPath = '/mnt/user/steam/steamapps/workshop/content/281990'
    const safeLibraryPath = '/mnt/user/steam'
    const locate = vi.fn<LocateGamePathsFn>(async () => ({
      workshopContentPaths: [safeWorkshopPath, homedir()],
      userModsFolder: '/mnt/user/Documents/Paradox Interactive/Stellaris/mod',
      steamLibraries: [safeLibraryPath, homedir()]
    }))
    const service = makeService(locate)

    const result = await service.locateGame('stellaris')

    expect(result.workshopContentPaths).toEqual([safeWorkshopPath])
    expect(result.steamLibraries).toEqual([safeLibraryPath])
  })

  it('keeps a fully non-critical result untouched', async () => {
    const paths: LocatedPaths = {
      installDir: '/mnt/user/steam/steamapps/common/Stellaris',
      workshopContentPaths: ['/mnt/user/steam/steamapps/workshop/content/281990'],
      userModsFolder: '/mnt/user/Documents/Paradox Interactive/Stellaris/mod',
      steamLibraries: ['/mnt/user/steam']
    }
    const locate = vi.fn<LocateGamePathsFn>(async () => paths)
    const service = makeService(locate)

    const result = await service.locateGame('stellaris')

    expect(result).toEqual(paths)
  })
})
