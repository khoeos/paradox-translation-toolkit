import { describe, expect, it } from 'vitest'

import type { RegistryLike } from '@ptt/shared'

import {
  APP_FOLDER,
  defaultUserDataPath,
  resolveDocuments,
  resolveDocumentsFrom,
  resolveUserData
} from './user-data.js'

const HOME = '/Users/x'

const countingRegistry = (): { registry: RegistryLike; readCalls: () => number } => {
  let count = 0
  const registry: RegistryLike = {
    async readValue() {
      count += 1
      return undefined
    }
  }
  return { registry, readCalls: () => count }
}

describe('defaultUserDataPath', () => {
  it('matches what Electron uses on macOS', () => {
    expect(defaultUserDataPath('darwin', {}, HOME)).toBe(
      `/Users/x/Library/Application Support/${APP_FOLDER}`
    )
  })

  it('matches what Electron uses on Windows', () => {
    expect(defaultUserDataPath('win32', { APPDATA: 'C:/Users/x/AppData/Roaming' }, HOME)).toBe(
      `C:/Users/x/AppData/Roaming/${APP_FOLDER}`
    )
  })

  it('falls back to the usual Roaming path when APPDATA is unset', () => {
    expect(defaultUserDataPath('win32', {}, HOME)).toBe(`/Users/x/AppData/Roaming/${APP_FOLDER}`)
  })

  it('matches what Electron uses on Linux', () => {
    expect(defaultUserDataPath('linux', {}, HOME)).toBe(`/Users/x/.config/${APP_FOLDER}`)
  })

  it('honours XDG_CONFIG_HOME on Linux', () => {
    expect(defaultUserDataPath('linux', { XDG_CONFIG_HOME: '/cfg' }, HOME)).toBe(
      `/cfg/${APP_FOLDER}`
    )
  })

  it('gives a different answer per platform, which is the whole point', () => {
    const paths = new Set([
      defaultUserDataPath('darwin', {}, HOME),
      defaultUserDataPath('win32', {}, HOME),
      defaultUserDataPath('linux', {}, HOME)
    ])
    expect(paths.size).toBe(3)
  })
})

describe('resolveDocumentsFrom', () => {
  it('takes an explicit path as is, without platform inference or a registry read', async () => {
    const { registry, readCalls } = countingRegistry()
    expect(
      await resolveDocumentsFrom('/mnt/user/Documents', 'win32', HOME, registry, undefined)
    ).toBe('/mnt/user/Documents')
    expect(readCalls()).toBe(0)
  })

  it('ignores an empty explicit path rather than using the working directory', async () => {
    const { registry } = countingRegistry()
    expect(await resolveDocumentsFrom('', 'linux', HOME, registry, undefined)).not.toBe('')
    expect(await resolveDocumentsFrom('   ', 'linux', HOME, registry, undefined)).not.toBe('   ')
  })

  it('falls back to the platform default, reading the registry on Windows', async () => {
    const { registry, readCalls } = countingRegistry()
    expect(await resolveDocumentsFrom(undefined, 'win32', HOME, registry, undefined)).toBe(
      '/Users/x/Documents'
    )
    expect(readCalls()).toBeGreaterThan(0)
  })

  it('does not read the registry on non-Windows platforms', async () => {
    const { registry, readCalls } = countingRegistry()
    await resolveDocumentsFrom(undefined, 'linux', HOME, registry, undefined)
    expect(readCalls()).toBe(0)
  })

  it('honours XDG_DATA_HOME on Linux even when the registry would answer', async () => {
    const { registry } = countingRegistry()
    expect(await resolveDocumentsFrom(undefined, 'linux', HOME, registry, '/xdg/data')).toBe(
      '/xdg/data'
    )
  })
})

describe('resolveDocuments', () => {
  it('takes an explicit path as is, without platform inference on top', async () => {
    expect(await resolveDocuments('/mnt/user/Documents')).toBe('/mnt/user/Documents')
  })

  it('ignores an empty explicit path rather than using the working directory', async () => {
    expect(await resolveDocuments('')).not.toBe('')
    expect(await resolveDocuments('   ')).not.toBe('   ')
  })

  it('falls back to the platform default', async () => {
    expect(await resolveDocuments()).not.toBe('')
  })
})

describe('resolveUserData', () => {
  it('takes an explicit path', () => {
    expect(resolveUserData('/tmp/data')).toBe('/tmp/data')
  })

  it('ignores an empty explicit path rather than using the working directory', () => {
    expect(resolveUserData('')).not.toBe('')
    expect(resolveUserData('   ')).toContain(APP_FOLDER)
  })

  it('falls back to the platform default', () => {
    expect(resolveUserData()).toContain(APP_FOLDER)
  })
})
