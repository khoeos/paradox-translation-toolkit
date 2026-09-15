import { describe, expect, it } from 'vitest'

import type { RegistryHive, RegistryLike } from '@ptt/shared'

import { nodeDocumentsPath, resolveDocumentsPath } from '../src/documents-path.js'

const HOME = 'C:/Users/Alice'

const SHELL_FOLDERS_KEY = 'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Shell Folders'
const USER_SHELL_FOLDERS_KEY =
  'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders'

const fakeRegistry = (
  values: Partial<Record<string, string | undefined>>
): { registry: RegistryLike; calls: Array<[RegistryHive, string, string]> } => {
  const calls: Array<[RegistryHive, string, string]> = []
  return {
    calls,
    registry: {
      async readValue(hive, key, name) {
        calls.push([hive, key, name])
        return values[key]
      }
    }
  }
}

describe('resolveDocumentsPath - non-Windows', () => {
  it('is home/Documents, without reading the registry', async () => {
    const { registry, calls } = fakeRegistry({})
    expect(await resolveDocumentsPath('linux', '/home/alice', registry)).toBe(
      '/home/alice/Documents'
    )
    expect(calls).toHaveLength(0)
  })

  it('is home/Documents on macOS too', async () => {
    const { registry } = fakeRegistry({})
    expect(await resolveDocumentsPath('darwin', '/Users/alice', registry)).toBe(
      '/Users/alice/Documents'
    )
  })
})

describe('resolveDocumentsPath - Windows', () => {
  it('uses the Personal value from Shell Folders, normalised to posix separators', async () => {
    const { registry, calls } = fakeRegistry({
      [SHELL_FOLDERS_KEY]: 'D:\\OneDrive\\Documents'
    })
    expect(await resolveDocumentsPath('win32', HOME, registry)).toBe('D:/OneDrive/Documents')
    expect(calls).toHaveLength(1)
  })

  it('falls back to User Shell Folders and expands %USERPROFILE% when Shell Folders is absent', async () => {
    const { registry, calls } = fakeRegistry({
      [USER_SHELL_FOLDERS_KEY]: '%USERPROFILE%\\Documents'
    })
    expect(await resolveDocumentsPath('win32', HOME, registry)).toBe('C:/Users/Alice/Documents')
    expect(calls).toHaveLength(2)
  })

  it('falls back to home/Documents when both registry keys are absent', async () => {
    const { registry } = fakeRegistry({})
    expect(await resolveDocumentsPath('win32', HOME, registry)).toBe('C:/Users/Alice/Documents')
  })

  it('treats a blank or whitespace-only value as absent', async () => {
    const { registry } = fakeRegistry({
      [SHELL_FOLDERS_KEY]: '   ',
      [USER_SHELL_FOLDERS_KEY]: ''
    })
    expect(await resolveDocumentsPath('win32', HOME, registry)).toBe('C:/Users/Alice/Documents')
  })
})

describe('nodeDocumentsPath', () => {
  it('does not throw on the current platform', async () => {
    await expect(nodeDocumentsPath()).resolves.toEqual(expect.any(String))
  })
})
