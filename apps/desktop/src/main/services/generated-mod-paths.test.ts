import { describe, expect, it } from 'vitest'

import { DEFAULT_MOD_FOLDER, GENERATED_MOD_FOLDER_MAX_LEN } from '@ptt/converter'
import { ck3, stellaris } from '@ptt/games'

import { resolveGeneratedMod } from './generated-mod-paths.js'

const DOCUMENTS = '/Users/x/Documents'

describe('resolveGeneratedMod', () => {
  it('places the mod under the game user folder the launcher reads', () => {
    const paths = resolveGeneratedMod(DOCUMENTS, stellaris, 'Missing Translations')
    expect(paths.modsDir).toBe('/Users/x/Documents/Paradox Interactive/Stellaris/mod')
    expect(paths.path).toBe(
      '/Users/x/Documents/Paradox Interactive/Stellaris/mod/missing_translations'
    )
  })

  it('uses the userFolder of the selected game', () => {
    expect(resolveGeneratedMod(DOCUMENTS, ck3).modsDir).toContain('Crusader Kings III')
  })

  it('keeps the name the user typed for the launcher, and sanitises the folder', () => {
    const paths = resolveGeneratedMod(DOCUMENTS, stellaris, '  My Russian Pack!  ')
    expect(paths.name).toBe('My Russian Pack!')
    expect(paths.folder).toBe('my_russian_pack')
  })

  it('falls back to the default name when none was typed', () => {
    expect(resolveGeneratedMod(DOCUMENTS, stellaris).folder).toBe(DEFAULT_MOD_FOLDER)
    expect(resolveGeneratedMod(DOCUMENTS, stellaris, '   ').folder).toBe(DEFAULT_MOD_FOLDER)
  })

  it('falls back to the default folder when the name sanitises to nothing', () => {
    expect(resolveGeneratedMod(DOCUMENTS, stellaris, '!!! ???').folder).toBe(DEFAULT_MOD_FOLDER)
  })

  it('caps the folder length so the path stays below the Windows limit', () => {
    const paths = resolveGeneratedMod(DOCUMENTS, stellaris, 'a'.repeat(200))
    expect(paths.folder.length).toBeLessThanOrEqual(GENERATED_MOD_FOLDER_MAX_LEN)
  })

  it('keeps an absolute Documents path absolute', () => {
    expect(resolveGeneratedMod(DOCUMENTS, stellaris).path.startsWith('/')).toBe(true)
  })

  it('normalises a Windows Documents path', () => {
    const paths = resolveGeneratedMod('C:\\Users\\x\\Documents', stellaris)
    expect(paths.path).toBe(
      'C:/Users/x/Documents/Paradox Interactive/Stellaris/mod/missing_translations'
    )
  })

  it('is stable, since the folder is how a previous run is found again', () => {
    const first = resolveGeneratedMod(DOCUMENTS, stellaris, 'My Pack')
    const second = resolveGeneratedMod(DOCUMENTS, stellaris, 'My Pack')
    expect(second).toEqual(first)
  })
})
