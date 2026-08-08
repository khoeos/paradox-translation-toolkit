import { describe, expect, it } from 'vitest'

import type { KeyReport } from '@ptt/converter-core'
import { MemoryFs } from '@ptt/converter-core/test/memory-fs'

import { BOM, KEY_COLUMNS, csvField, keyRow, toCsv, writeKeyCsv } from '../src/index.js'

const key = (over: Partial<KeyReport> = {}): KeyReport => ({
  modId: 'mymod',
  modName: 'My Mod',
  language: 'ru',
  key: 'K',
  file: 'mod/localisation/a_l_english.yml',
  source: 'Colony Ship',
  state: 'missing',
  ...over
})

describe('csvField', () => {
  it('leaves a plain value alone', () => {
    expect(csvField('Colony Ship')).toBe('Colony Ship')
  })

  it('renders undefined as an empty field', () => {
    expect(csvField(undefined)).toBe('')
  })

  it('renders a number', () => {
    expect(csvField(42)).toBe('42')
  })

  it('quotes a value holding a comma', () => {
    expect(csvField('a,b')).toBe('"a,b"')
  })

  it('doubles an inner quote', () => {
    expect(csvField('he said "yes"')).toBe('"he said ""yes"""')
  })

  it('quotes a value holding a newline', () => {
    expect(csvField('a\nb')).toBe('"a\nb"')
  })
})

describe('csvField - formula injection (S-2)', () => {
  // The source, key and mod name columns come from third-party mod content, so a booby-trapped
  // mod could have a formula evaluated the moment the report was opened.
  const dangerous = ['=', '+', '-', '@', '\t', '\r']

  for (const prefix of dangerous) {
    it(`neutralises a value starting with ${JSON.stringify(prefix)}`, () => {
      const field = csvField(`${prefix}cmd|'/c calc'!A1`)
      expect(field.replace(/^"/, '').startsWith("'")).toBe(true)
    })
  }

  it('neutralises the classic DDE payload', () => {
    expect(csvField("=cmd|' /C calc'!A0")).toBe(`"'=cmd|' /C calc'!A0"`)
  })

  it('leaves a formula character in the middle of a value alone', () => {
    expect(csvField('a=b')).toBe('a=b')
  })

  it('does not mangle a value that merely contains a minus', () => {
    expect(csvField('Men-at-Arms')).toBe('Men-at-Arms')
  })

  it('makes a negative number text, which is the accepted trade-off', () => {
    expect(csvField('-5')).toBe(`"'-5"`)
  })
})

describe('toCsv', () => {
  it('opens with the BOM Excel needs to read UTF-8', () => {
    expect(toCsv(['a'], []).startsWith(BOM)).toBe(true)
  })

  it('writes the header then the rows, CRLF separated', () => {
    const csv = toCsv(['a', 'b'], [[1, 2]])
    expect(csv).toBe(`${BOM}a,b\r\n1,2\r\n`)
  })

  it('ends with a line break', () => {
    expect(toCsv(['a'], [['x']]).endsWith('\r\n')).toBe(true)
  })

  it('handles a header with no rows', () => {
    expect(toCsv(['a', 'b'], [])).toBe(`${BOM}a,b\r\n`)
  })
})

describe('keyRow', () => {
  it('puts the fields in KEY_COLUMNS order', () => {
    const row = keyRow(key({ provider: 'RU Patch', reason: 'markup: lost $A$' }))
    expect(row).toHaveLength(KEY_COLUMNS.length)
    expect(row[0]).toBe('My Mod')
    expect(row[KEY_COLUMNS.indexOf('state')]).toBe('missing')
    expect(row[KEY_COLUMNS.indexOf('reason')]).toBe('markup: lost $A$')
  })

  it('renders the booleans as yes or empty, which reads better in a spreadsheet', () => {
    const set = keyRow(key({ markupOnly: true, shadowed: true }))
    expect(set[KEY_COLUMNS.indexOf('markupOnly')]).toBe('yes')
    const unset = keyRow(key())
    expect(unset[KEY_COLUMNS.indexOf('shadowed')]).toBe('')
  })
})

describe('writeKeyCsv', () => {
  it('writes a readable CSV', async () => {
    const fs = new MemoryFs()
    const result = await writeKeyCsv('reports/keys.csv', [key()], fs)
    expect(result).toEqual({ rows: 1, dropped: 0 })
    const content = fs.snapshot().get('reports/keys.csv') ?? ''
    expect(content).toContain('mod,modId,language')
    expect(content).toContain('Colony Ship')
  })

  it('creates the reports folder', async () => {
    const fs = new MemoryFs()
    await writeKeyCsv('deep/nested/keys.csv', [key()], fs)
    expect(fs.snapshot().has('deep/nested/keys.csv')).toBe(true)
  })

  it('writes a header-only file for an empty run', async () => {
    const fs = new MemoryFs()
    const result = await writeKeyCsv('reports/keys.csv', [], fs)
    expect(result.rows).toBe(0)
    expect(fs.snapshot().get('reports/keys.csv')).toBe(toCsv(KEY_COLUMNS, []))
  })

  it('reports how many rows it had to drop', async () => {
    // A whole collection can refuse more strings than a spreadsheet holds.
    const fs = new MemoryFs()
    const { MAX_CSV_ROWS } = await import('../src/index.js')
    const many = Array.from({ length: MAX_CSV_ROWS + 5 }, (_, i) => key({ key: `K${i}` }))
    const result = await writeKeyCsv('reports/keys.csv', many, fs)
    expect(result.rows).toBe(MAX_CSV_ROWS)
    expect(result.dropped).toBe(5)
  })
})
