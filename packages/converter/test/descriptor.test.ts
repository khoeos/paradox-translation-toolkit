import { describe, expect, it } from 'vitest'

import { buildDescriptor, pickSupportedVersion, readDescriptor } from '../src/index.js'
import { MemoryFs } from './memory-fs.js'

describe('readDescriptor', () => {
  it('reads the name, supported version and remote file id', async () => {
    const fs = new MemoryFs({
      'mod/descriptor.mod': [
        'name="Ethics Overhaul"',
        'supported_version="1.19.0.6"',
        'remote_file_id="2887679980"'
      ].join('\n')
    })
    expect(await readDescriptor('mod', fs)).toEqual({
      name: 'Ethics Overhaul',
      supportedVersion: '1.19.0.6',
      remoteFileId: '2887679980',
      dependencies: []
    })
  })

  it('reads the dependency block, which names the patched mod', async () => {
    const fs = new MemoryFs({
      'mod/descriptor.mod': 'name="RU Patch"\ndependencies={ "Ethics Overhaul" "Other Mod" }'
    })
    const descriptor = await readDescriptor('mod', fs)
    expect(descriptor.dependencies).toEqual(['Ethics Overhaul', 'Other Mod'])
  })

  it('trims the values', async () => {
    const fs = new MemoryFs({ 'mod/descriptor.mod': '  name = "  Spaced  "  ' })
    expect((await readDescriptor('mod', fs)).name).toBe('Spaced')
  })

  it('tolerates a missing dependency block', async () => {
    const fs = new MemoryFs({ 'mod/descriptor.mod': 'name="Solo"' })
    expect((await readDescriptor('mod', fs)).dependencies).toEqual([])
  })

  it('prefers descriptor.mod over any other .mod file', async () => {
    // descriptor.mod is the one the game reads; the launcher one can be stale.
    const fs = new MemoryFs({
      'mod/aaa.mod': 'name="Launcher Copy"',
      'mod/descriptor.mod': 'name="Real Name"'
    })
    expect((await readDescriptor('mod', fs)).name).toBe('Real Name')
  })

  it('falls back to another .mod file when descriptor.mod says nothing', async () => {
    const fs = new MemoryFs({
      'mod/descriptor.mod': '# nothing useful here',
      'mod/launcher.mod': 'name="Launcher Copy"'
    })
    expect((await readDescriptor('mod', fs)).name).toBe('Launcher Copy')
  })

  it('returns an empty descriptor when the folder cannot be read', async () => {
    const fs = new MemoryFs({})
    expect(await readDescriptor('nowhere', fs)).toEqual({})
  })

  it('returns an empty descriptor when no .mod file is present', async () => {
    const fs = new MemoryFs({ 'mod/localisation/a_l_english.yml': 'x' })
    expect(await readDescriptor('mod', fs)).toEqual({})
  })

  it('skips a .mod file it cannot read', async () => {
    const fs = new MemoryFs({ 'mod/descriptor.mod': 'name="Ok"' })
    const original = fs.readFile.bind(fs)
    let first = true
    fs.readFile = async (path, encoding) => {
      if (first) {
        first = false
        throw new Error('EACCES')
      }
      return original(path, encoding)
    }
    expect(await readDescriptor('mod', fs)).toEqual({})
  })

  it('accepts a version with no name', async () => {
    const fs = new MemoryFs({ 'mod/descriptor.mod': 'supported_version="1.19.*"' })
    const descriptor = await readDescriptor('mod', fs)
    expect(descriptor.supportedVersion).toBe('1.19.*')
    expect(descriptor.name).toBeUndefined()
  })
})

describe('pickSupportedVersion', () => {
  it('prefers the version of mods that actually needed files', async () => {
    const version = pickSupportedVersion([
      { createdCount: 2, supportedVersion: '1.19.0.6' },
      { createdCount: 0, supportedVersion: '1.15.0' },
      { createdCount: 0, supportedVersion: '1.15.0' }
    ])
    expect(version).toBe('1.19.0.6')
  })

  it('takes the most frequent version among them', async () => {
    const version = pickSupportedVersion([
      { createdCount: 1, supportedVersion: '1.19.0.6' },
      { createdCount: 1, supportedVersion: '1.19.0.6' },
      { createdCount: 1, supportedVersion: '1.18.0' }
    ])
    expect(version).toBe('1.19.0.6')
  })

  it('falls back to every readable mod when none produced files', async () => {
    const version = pickSupportedVersion([
      { createdCount: 0, supportedVersion: '1.18.0' },
      { createdCount: 0 }
    ])
    expect(version).toBe('1.18.0')
  })

  it('invents nothing when no mod declares a version', async () => {
    // `*` is what the launcher reads as "any version".
    expect(pickSupportedVersion([{ createdCount: 3 }])).toBe('*')
    expect(pickSupportedVersion([])).toBe('*')
  })
})

describe('buildDescriptor', () => {
  const mod = {
    name: 'Missing Translations',
    folder: 'missing_translations',
    path: 'documents/mod/missing_translations',
    supportedVersion: '1.19.0.6'
  }

  it('writes the fields the game reads', () => {
    const content = buildDescriptor(mod, false)
    expect(content).toContain('name="Missing Translations"')
    expect(content).toContain('supported_version="1.19.0.6"')
    expect(content).toContain('"Translation"')
    expect(content.endsWith('\n')).toBe(true)
  })

  it('omits the path field on the descriptor the game reads', () => {
    expect(buildDescriptor(mod, false)).not.toContain('path=')
  })

  it('adds the path field on the outer file the launcher reads', () => {
    expect(buildDescriptor(mod, true)).toContain('path="mod/missing_translations"')
  })

  it('turns a quote in the name into an apostrophe', () => {
    // A quote would end the field early and the launcher would read a broken descriptor.
    const content = buildDescriptor({ ...mod, name: 'Bob\'s "Best" Mods' }, false)
    expect(content).toContain(`name="Bob's 'Best' Mods"`)
  })
})
