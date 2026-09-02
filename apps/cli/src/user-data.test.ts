import { describe, expect, it } from 'vitest'

import {
  APP_FOLDER,
  defaultDocumentsPath,
  defaultUserDataPath,
  resolveUserData
} from './user-data.js'

const HOME = '/Users/x'

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

describe('defaultDocumentsPath', () => {
  it('is Documents under the home folder', () => {
    expect(defaultDocumentsPath(HOME)).toBe('/Users/x/Documents')
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
