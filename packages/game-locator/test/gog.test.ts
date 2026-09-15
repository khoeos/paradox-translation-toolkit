import { describe, expect, it } from 'vitest'
import type { RegistryHive, RegistryLike } from '@ptt/shared'
import { findGogInstall } from '../src/gog.js'

const createFakeRegistry = (values: Partial<Record<string, string | undefined>>) => {
  let callCount = 0
  const registry: RegistryLike = {
    readValue: async (hive: RegistryHive, key: string, name: string) => {
      callCount += 1
      return values[`${hive}:${key}:${name}`]
    },
  }
  return { registry, getCallCount: () => callCount }
}

describe('findGogInstall', () => {
  it('returns undefined for a game not listed in the table, without calling the registry', async () => {
    const { registry, getCallCount } = createFakeRegistry({})

    const result = await findGogInstall('victoria3', 'win32', registry)

    expect(result).toBeUndefined()
    expect(getCallCount()).toBe(0)
  })

  it('returns undefined on darwin for a listed game, without calling the registry', async () => {
    const { registry, getCallCount } = createFakeRegistry({
      'HKCU:Software\\GOG.com\\Games\\1508702879:path': 'C:\\Games\\Stellaris',
    })

    const result = await findGogInstall('stellaris', 'darwin', registry)

    expect(result).toBeUndefined()
    expect(getCallCount()).toBe(0)
  })

  it('returns undefined on linux for a listed game, without calling the registry', async () => {
    const { registry, getCallCount } = createFakeRegistry({
      'HKCU:Software\\GOG.com\\Games\\1508702879:path': 'C:\\Games\\Stellaris',
    })

    const result = await findGogInstall('stellaris', 'linux', registry)

    expect(result).toBeUndefined()
    expect(getCallCount()).toBe(0)
  })

  it('returns the path found via HKCU without querying HKLM', async () => {
    const { registry, getCallCount } = createFakeRegistry({
      'HKCU:Software\\GOG.com\\Games\\1508702879:path': 'C:\\Games\\Stellaris',
    })

    const result = await findGogInstall('stellaris', 'win32', registry)

    expect(result).toBe('C:/Games/Stellaris')
    expect(getCallCount()).toBe(1)
  })

  it('falls back to HKLM when HKCU has no value', async () => {
    const { registry, getCallCount } = createFakeRegistry({
      'HKLM:Software\\GOG.com\\Games\\2131232214:path': 'C:\\Games\\Imperator',
    })

    const result = await findGogInstall('imperator', 'win32', registry)

    expect(result).toBe('C:/Games/Imperator')
    expect(getCallCount()).toBe(2)
  })

  it('returns undefined when neither hive has a value', async () => {
    const { registry } = createFakeRegistry({})

    const result = await findGogInstall('stellaris', 'win32', registry)

    expect(result).toBeUndefined()
  })

  it('treats an empty or whitespace-only value as absent and falls back then returns undefined', async () => {
    const { registry, getCallCount } = createFakeRegistry({
      'HKCU:Software\\GOG.com\\Games\\1508702879:path': '   ',
      'HKLM:Software\\GOG.com\\Games\\1508702879:path': '',
    })

    const result = await findGogInstall('stellaris', 'win32', registry)

    expect(result).toBeUndefined()
    expect(getCallCount()).toBe(2)
  })
})
