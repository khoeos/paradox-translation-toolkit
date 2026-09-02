import { describe, expect, it } from 'vitest'

import { MAX_MOD_LOCALISATION_BYTES, MAX_SOURCE_FILE_BYTES, readModKeys } from '../src/index.js'
import { localeFile, stellarisDef } from './fixtures.js'
import { MemoryFs } from './memory-fs.js'

const withReportedSize = (fs: MemoryFs, bytes: number): MemoryFs => {
  const realStat = fs.stat.bind(fs)
  fs.stat = async path =>
    path.endsWith('.yml') ? { isDirectory: false, isFile: true, size: bytes } : realStat(path)
  return fs
}

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
    const fs = new MemoryFs({
      'mod/localisation/klingon/a_l_klingon.yml': localeFile('klingon', [['K', 'tlh']])
    })
    const keys = await readModKeys('mod', stellarisDef, fs)
    expect(keys.byLanguage.size).toBe(0)
    expect(keys.diagnostics).toContainEqual({
      severity: 'error',
      message: expect.stringContaining('klingon')
    })
  })

  it('reports a file with no language header instead of guessing from the folder', async () => {
    const fs = new MemoryFs({
      'mod/localisation/russian/a_l_russian.yml': ' K:0 "no header above"\n'
    })
    const keys = await readModKeys('mod', stellarisDef, fs)
    expect(keys.byLanguage.size).toBe(0)
    expect(keys.diagnostics).toContainEqual({
      severity: 'error',
      message: expect.stringContaining('none of its keys can be read')
    })
    expect(keys.diagnostics).toContainEqual({
      severity: 'warning',
      message: expect.stringContaining('Content before the `l_<language>:` header')
    })
  })

  it('calls a dangling line a warning and reads the rest of the file', async () => {
    const fs = new MemoryFs({
      'mod/localisation/a_l_english.yml': `${localeFile('english', [['K', 'A']])} DANGLING_KEY\n`
    })
    const keys = await readModKeys('mod', stellarisDef, fs)
    expect([...(keys.byLanguage.get('en')?.keys() ?? [])]).toEqual(['K'])
    expect(keys.diagnostics).toEqual([
      {
        severity: 'warning',
        message:
          'mod/localisation/a_l_english.yml:3 : Dangling line: no `:` and no value, line skipped (the game skips it too)'
      }
    ])
  })

  it('calls a key with no value a warning too', async () => {
    const fs = new MemoryFs({
      'mod/localisation/a_l_english.yml': `${localeFile('english', [['K', 'A']])} NO_VALUE:\n`
    })
    const keys = await readModKeys('mod', stellarisDef, fs)
    expect(keys.diagnostics.map(d => d.severity)).toEqual(['warning'])
  })

  it('calls a value with no closing quote an error, unlike its line-level siblings', async () => {
    const fs = new MemoryFs({
      'mod/localisation/a_l_english.yml': `${localeFile('english', [['K', 'A']])} NEVER_CLOSED:0 "runs off\n`
    })
    const keys = await readModKeys('mod', stellarisDef, fs)
    expect(keys.diagnostics.map(d => d.severity)).toEqual(['error'])
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
    expect(keys.diagnostics).toContainEqual({
      severity: 'error',
      message: expect.stringContaining('EACCES')
    })
  })

  it('refuses a single file too large to be a localisation file, and reads the others', async () => {
    const fs = new MemoryFs({
      'mod/localisation/a_l_english.yml': localeFile('english', [['K', 'A']]),
      'mod/localisation/huge_l_english.yml': localeFile('english', [['K2', 'B']])
    })
    const realStat = fs.stat.bind(fs)
    fs.stat = async path =>
      path.endsWith('huge_l_english.yml')
        ? { isDirectory: false, isFile: true, size: MAX_SOURCE_FILE_BYTES + 1 }
        : realStat(path)

    const keys = await readModKeys('mod', stellarisDef, fs)
    expect([...(keys.byLanguage.get('en')?.keys() ?? [])]).toEqual(['K'])
    expect(keys.diagnostics).toContainEqual({
      severity: 'error',
      message: expect.stringContaining('huge_l_english.yml exceeds')
    })
  })

  it('stops a mod whose localisation exceeds the memory budget instead of reading it all', async () => {
    const quarter = MAX_MOD_LOCALISATION_BYTES / 4
    const fs = withReportedSize(
      new MemoryFs(
        Object.fromEntries(
          ['a', 'b', 'c', 'd', 'e'].map(name => [
            `mod/localisation/${name}_l_english.yml`,
            localeFile('english', [[`KEY_${name.toUpperCase()}`, name]])
          ])
        )
      ),
      quarter
    )
    let reads = 0
    const realRead = fs.readFile.bind(fs)
    fs.readFile = async (path, encoding) => {
      reads++
      return realRead(path, encoding)
    }

    const keys = await readModKeys('mod', stellarisDef, fs)
    expect(reads).toBe(4)
    expect([...(keys.byLanguage.get('en')?.keys() ?? [])]).toEqual([
      'KEY_A',
      'KEY_B',
      'KEY_C',
      'KEY_D'
    ])
    expect(keys.diagnostics).toContainEqual({
      severity: 'error',
      message: expect.stringContaining('1 file(s) left unread')
    })
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
