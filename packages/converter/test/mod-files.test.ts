import { describe, expect, it } from 'vitest'

import { describeLocalisationFile, otherLocalisationSpelling, readModFiles } from '../src/index.js'
import { ck3Def, localeFile, stellarisDef } from './fixtures.js'
import { MemoryFs } from './memory-fs.js'

describe('otherLocalisationSpelling', () => {
  it('pairs the two spellings', () => {
    expect(otherLocalisationSpelling('localisation')).toBe('localization')
    expect(otherLocalisationSpelling('localization')).toBe('localisation')
  })
})

describe('describeLocalisationFile', () => {
  it('describes the path below the localisation folder', () => {
    const described = describeLocalisationFile(
      'mod/localisation/english/foo_l_english.yml',
      'localisation'
    )
    expect(described?.locIndex).toBe(1)
    expect(described?.rest).toEqual(['english', 'foo_l_english.yml'])
  })

  it('anchors on the deepest localisation folder', () => {
    const described = describeLocalisationFile(
      'mod/localisation/extra/localisation/foo_l_english.yml',
      'localisation'
    )
    expect(described?.rest).toEqual(['foo_l_english.yml'])
  })

  it('matches the folder case-insensitively', () => {
    expect(
      describeLocalisationFile('mod/Localisation/a_l_english.yml', 'localisation')
    ).not.toBeNull()
  })

  it('returns null when no localisation folder is in the path', () => {
    expect(describeLocalisationFile('mod/gfx/a_l_english.yml', 'localisation')).toBeNull()
  })

  it('returns null when the localisation segment is the file itself', () => {
    expect(describeLocalisationFile('mod/localisation', 'localisation')).toBeNull()
  })

  it('does not match the other spelling', () => {
    expect(describeLocalisationFile('mod/localization/a_l_english.yml', 'localisation')).toBeNull()
  })
})

describe('readModFiles', () => {
  it('finds files in both the nested and the flat layout', async () => {
    const fs = new MemoryFs({
      'mod/localisation/english/a_l_english.yml': localeFile('english'),
      'mod/localisation/b_l_english.yml': localeFile('english')
    })
    const result = await readModFiles('mod', stellarisDef, fs)
    expect(result.files).toHaveLength(2)
  })

  it('walks replace/, which real mods use for translated strings', async () => {
    // Skipping it silently ignored 4 files and 11 keys in Succession Expanded.
    const fs = new MemoryFs({
      'mod/localisation/replace/a_l_english.yml': localeFile('english')
    })
    const result = await readModFiles('mod', stellarisDef, fs)
    expect(result.files).toHaveLength(1)
  })

  it('ignores files outside a localisation folder', async () => {
    const fs = new MemoryFs({
      'mod/gfx/a_l_english.yml': localeFile('english'),
      'mod/localisation/b_l_english.yml': localeFile('english')
    })
    const result = await readModFiles('mod', stellarisDef, fs)
    expect(result.files.map(f => f.path)).toEqual(['mod/localisation/b_l_english.yml'])
  })

  it('ignores non-yml files', async () => {
    const fs = new MemoryFs({
      'mod/localisation/readme.txt': 'x',
      'mod/localisation/a_l_english.yml': localeFile('english')
    })
    const result = await readModFiles('mod', stellarisDef, fs)
    expect(result.files).toHaveLength(1)
  })

  it('flags the other spelling, which means the wrong game is selected', async () => {
    const fs = new MemoryFs({
      'mod/localization/english/a_l_english.yml': localeFile('english')
    })
    const result = await readModFiles('mod', stellarisDef, fs)
    expect(result.otherSpelling).toBe(true)
    expect(result.files).toHaveLength(0)
  })

  it('flags the other spelling even when the folder holds nothing', async () => {
    const fs = new MemoryFs({ 'mod/localisation/a_l_english.yml': localeFile('english') })
    await fs.mkdir('mod/localization', { recursive: true })
    const result = await readModFiles('mod', stellarisDef, fs)
    expect(result.otherSpelling).toBe(true)
  })

  it('does not flag the spelling the game actually uses', async () => {
    const fs = new MemoryFs({
      'mod/localization/english/a_l_english.yml': localeFile('english')
    })
    const result = await readModFiles('mod', ck3Def, fs)
    expect(result.otherSpelling).toBe(false)
    expect(result.files).toHaveLength(1)
  })

  it('passes read errors through instead of throwing', async () => {
    const fs = new MemoryFs({})
    const result = await readModFiles('nowhere', stellarisDef, fs)
    expect(result.files).toEqual([])
    expect(result.diagnostics).toHaveLength(1)
  })
})
