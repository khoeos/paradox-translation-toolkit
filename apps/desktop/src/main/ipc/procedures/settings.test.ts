import { homedir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { assertAddableKnownPath, SettingsPatchSchema } from './settings.js'

describe('SettingsPatchSchema knownPaths', () => {
  it('accepts a well-formed knownPaths entry', () => {
    const result = SettingsPatchSchema.safeParse({
      knownPaths: [
        {
          path: '/mods/stellaris',
          gameId: 'stellaris',
          kind: 'modFolder',
          lastUsedAt: '2024-06-01T00:00:00.000Z',
          pinned: true
        }
      ]
    })

    expect(result.success).toBe(true)
  })

  it('rejects an entry with a non-boolean pinned field', () => {
    const result = SettingsPatchSchema.safeParse({
      knownPaths: [
        {
          path: '/mods/stellaris',
          gameId: 'stellaris',
          kind: 'modFolder',
          lastUsedAt: '2024-06-01T00:00:00.000Z',
          pinned: 'yes'
        }
      ]
    })

    expect(result.success).toBe(false)
  })

  it('rejects an entry with an unknown gameId', () => {
    const result = SettingsPatchSchema.safeParse({
      knownPaths: [
        {
          path: '/mods/unknown',
          gameId: 'not-a-real-game',
          kind: 'modFolder',
          lastUsedAt: '2024-06-01T00:00:00.000Z',
          pinned: false
        }
      ]
    })

    expect(result.success).toBe(false)
  })

  it('rejects an entry with an unknown kind', () => {
    const result = SettingsPatchSchema.safeParse({
      knownPaths: [
        {
          path: '/mods/stellaris',
          gameId: 'stellaris',
          kind: 'somethingElse',
          lastUsedAt: '2024-06-01T00:00:00.000Z',
          pinned: false
        }
      ]
    })

    expect(result.success).toBe(false)
  })

  it('rejects an entry with the kind field omitted', () => {
    const result = SettingsPatchSchema.safeParse({
      knownPaths: [
        { path: '/mods/stellaris', gameId: 'stellaris', lastUsedAt: '2024-06-01T00:00:00.000Z', pinned: false }
      ]
    })

    expect(result.success).toBe(false)
  })

  it('accepts a well-formed gameInstall knownPaths entry', () => {
    const result = SettingsPatchSchema.safeParse({
      knownPaths: [
        {
          path: '/games/stellaris',
          gameId: 'stellaris',
          kind: 'gameInstall',
          lastUsedAt: '2024-06-01T00:00:00.000Z',
          pinned: false
        }
      ]
    })

    expect(result.success).toBe(true)
  })

  it('accepts a patch with knownPaths omitted', () => {
    const result = SettingsPatchSchema.safeParse({ autoCheckUpdates: true })

    expect(result.success).toBe(true)
  })

  it('rejects a lastUsedAt that is not a valid ISO datetime', () => {
    const result = SettingsPatchSchema.safeParse({
      knownPaths: [
        {
          path: '/mods/stellaris',
          gameId: 'stellaris',
          kind: 'modFolder',
          lastUsedAt: '9999999999',
          pinned: false
        }
      ]
    })

    expect(result.success).toBe(false)
  })
})

describe('assertAddableKnownPath', () => {
  it('does not throw for a plausible absolute, non-critical path', () => {
    expect(() => assertAddableKnownPath(join(homedir(), 'mods', 'example'))).not.toThrow()
  })

  it('does not throw for an absolute path that does not currently exist', () => {
    expect(() => assertAddableKnownPath(join(homedir(), 'mods', 'unplugged-drive-xyz'))).not.toThrow()
  })

  it('throws on a relative path', () => {
    expect(() => assertAddableKnownPath('mods/example')).toThrow(/absolute/)
  })

  it('throws on a critical folder', () => {
    expect(() => assertAddableKnownPath(homedir())).toThrow(/critical/)
  })
})
