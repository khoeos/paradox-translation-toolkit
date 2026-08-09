import { describe, expect, it } from 'vitest'

import { readModKeys } from '../src/index.js'
import { localeFile, stellarisDef } from './fixtures.js'
import { MemoryFs } from './memory-fs.js'

describe('readModKeys', () => {
  it('groups keys by language', async () => {
    const fs = new MemoryFs({
      'mod/localisation/english/a_l_english.yml': localeFile('english', [['KEY_A', 'A']]),
      'mod/localisation/russian/a_l_russian.yml': localeFile('russian', [['KEY_A', 'А']])
    })
    const keys = await readModKeys('mod', stellarisDef, fs)
    expect(keys.files).toBe(2)
    expect([...(keys.byLanguage.get('en')?.keys() ?? [])]).toEqual(['KEY_A'])
    expect([...(keys.byLanguage.get('ru')?.keys() ?? [])]).toEqual(['KEY_A'])
  })

  it('trusts the l_<language> header over the folder name', async () => {
    // The header is what the game actually reads.
    const fs = new MemoryFs({
      'mod/localisation/english/mislabelled_l_english.yml': localeFile('russian', [['K', 'Р']])
    })
    const keys = await readModKeys('mod', stellarisDef, fs)
    expect(keys.byLanguage.has('ru')).toBe(true)
    expect(keys.byLanguage.has('en')).toBe(false)
  })

  it('keeps the source value, which is what tells a translation from a copy', async () => {
    const fs = new MemoryFs({
      'mod/localisation/a_l_english.yml': localeFile('english', [['K', 'Gain $AMOUNT$ energy']])
    })
    const keys = await readModKeys('mod', stellarisDef, fs)
    expect(keys.byLanguage.get('en')?.get('K')?.value).toBe('Gain $AMOUNT$ energy')
  })

  it('records where a key was declared', async () => {
    const fs = new MemoryFs({
      'mod/localisation/english/a_l_english.yml': localeFile('english', [['K', 'A']])
    })
    const keys = await readModKeys('mod', stellarisDef, fs)
    const entry = keys.byLanguage.get('en')?.get('K')
    expect(entry?.file).toBe('mod/localisation/english/a_l_english.yml')
    expect(entry?.described.rest).toEqual(['english', 'a_l_english.yml'])
  })

  it('lets the first declaration win when a key is duplicated', async () => {
    const fs = new MemoryFs({
      'mod/localisation/a_l_english.yml': localeFile('english', [
        ['K', 'first'],
        ['K', 'second']
      ])
    })
    const keys = await readModKeys('mod', stellarisDef, fs)
    expect(keys.byLanguage.get('en')?.get('K')?.value).toBe('first')
  })

  it('skips a language the game does not declare', async () => {
    // Nothing downstream could act on it, and it must not count as coverage.
    const fs = new MemoryFs({
      'mod/localisation/klingon/a_l_klingon.yml': localeFile('klingon', [['K', 'tlh']])
    })
    const keys = await readModKeys('mod', stellarisDef, fs)
    expect(keys.byLanguage.size).toBe(0)
    expect(keys.diagnostics.some(d => d.includes('klingon'))).toBe(true)
  })

  it('reports a file with no language header instead of guessing from the folder', async () => {
    // The games do not load a headerless file either. The original inferred the language from
    // the folder name, which hid a malformed file behind a plausible guess.
    const fs = new MemoryFs({
      'mod/localisation/russian/a_l_russian.yml': ' K:0 "no header above"\n'
    })
    const keys = await readModKeys('mod', stellarisDef, fs)
    expect(keys.byLanguage.size).toBe(0)
    expect(keys.diagnostics.some(d => d.includes('header'))).toBe(true)
  })

  it('creates no language bucket for a file holding no entry', async () => {
    const fs = new MemoryFs({ 'mod/localisation/a_l_english.yml': localeFile('english') })
    const keys = await readModKeys('mod', stellarisDef, fs)
    expect(keys.files).toBe(1)
    expect(keys.byLanguage.size).toBe(0)
  })

  it('reports an unreadable file and keeps the others', async () => {
    const fs = new MemoryFs({
      'mod/localisation/a_l_english.yml': localeFile('english', [['K', 'A']]),
      'mod/localisation/b_l_english.yml': localeFile('english', [['K2', 'B']])
    })
    const original = fs.readFile.bind(fs)
    fs.readFile = async (path, encoding) => {
      if (path.endsWith('b_l_english.yml')) throw new Error('EACCES')
      return original(path, encoding)
    }
    const keys = await readModKeys('mod', stellarisDef, fs)
    expect([...(keys.byLanguage.get('en')?.keys() ?? [])]).toEqual(['K'])
    expect(keys.diagnostics.some(d => d.includes('EACCES'))).toBe(true)
  })

  it('carries the other-spelling flag through', async () => {
    const fs = new MemoryFs({
      'mod/localization/english/a_l_english.yml': localeFile('english', [['K', 'A']])
    })
    const keys = await readModKeys('mod', stellarisDef, fs)
    expect(keys.otherSpelling).toBe(true)
  })

  it('returns nothing for a mod with no localisation at all', async () => {
    const fs = new MemoryFs({ 'mod/gfx/icon.dds': 'x' })
    const keys = await readModKeys('mod', stellarisDef, fs)
    expect(keys.files).toBe(0)
    expect(keys.byLanguage.size).toBe(0)
  })
})
