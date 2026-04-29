import { describe, expect, it } from 'vitest'

import { parse } from '../src/parser.js'

const BOM = '﻿'

describe('parse - BOM handling', () => {
  it('detects BOM at start of file', () => {
    const result = parse(`${BOM}l_english:\n KEY:0 "value"\n`)
    expect(result.file.bom).toBe(true)
    expect(result.ok).toBe(true)
  })

  it('handles files without BOM', () => {
    const result = parse(`l_english:\n KEY:0 "value"\n`)
    expect(result.file.bom).toBe(false)
    expect(result.ok).toBe(true)
  })

  it('warns on missing BOM under strictBom', () => {
    const result = parse(`l_english:\n KEY:0 "value"\n`, { strictBom: true })
    expect(result.diagnostics.some(d => d.code === 'no-bom')).toBe(true)
  })

  it('does not warn on missing BOM by default', () => {
    const result = parse(`l_english:\n KEY:0 "value"\n`)
    expect(result.diagnostics.some(d => d.code === 'no-bom')).toBe(false)
  })
})

describe('parse - language header', () => {
  it('extracts the language from the header', () => {
    const result = parse(`l_french:\n KEY:0 "value"\n`)
    expect(result.file.language).toBe('french')
  })

  it('handles Stellaris simp_chinese', () => {
    const result = parse(`l_simp_chinese:\n KEY:0 "value"\n`)
    expect(result.file.language).toBe('simp_chinese')
  })

  it('handles braz_por', () => {
    const result = parse(`l_braz_por:\n KEY:0 "value"\n`)
    expect(result.file.language).toBe('braz_por')
  })

  it('lowercases language token', () => {
    const result = parse(`l_ENGLISH:\n KEY:0 "value"\n`)
    expect(result.file.language).toBe('english')
  })

  it('errors when no header is present', () => {
    const result = parse(` KEY:0 "value"\n`)
    expect(result.ok).toBe(false)
    expect(
      result.diagnostics.some(d => d.code === 'no-header' || d.code === 'missing-header')
    ).toBe(true)
  })

  it('errors on empty input', () => {
    const result = parse('')
    expect(result.ok).toBe(false)
    expect(result.diagnostics.some(d => d.code === 'missing-header')).toBe(true)
  })
})

describe('parse - entries', () => {
  it('parses an entry with explicit version', () => {
    const result = parse(`l_english:\n KEY:0 "value"\n`)
    expect(result.file.entries).toHaveLength(1)
    expect(result.file.entries[0]).toEqual({
      key: 'KEY',
      version: 0,
      value: 'value',
      rawLine: 2
    })
  })

  it('parses an entry without version (omitted)', () => {
    const result = parse(`l_english:\n KEY: "value"\n`)
    expect(result.file.entries[0]?.version).toBeNull()
  })

  it('parses a non-zero version number', () => {
    const result = parse(`l_english:\n KEY:42 "value"\n`)
    expect(result.file.entries[0]?.version).toBe(42)
  })

  it('parses keys with underscores, dots, dashes, digits', () => {
    const result = parse(
      `l_english:\n KEY_WITH_UNDERSCORE:0 "a"\n key.with.dots:0 "b"\n key-with-dashes:0 "c"\n KEY123:0 "d"\n`
    )
    expect(result.file.entries.map(e => e.key)).toEqual([
      'KEY_WITH_UNDERSCORE',
      'key.with.dots',
      'key-with-dashes',
      'KEY123'
    ])
  })

  it('parses multiple entries', () => {
    const source = `l_english:\n A:0 "alpha"\n B:0 "beta"\n C:0 "gamma"\n`
    const result = parse(source)
    expect(result.file.entries).toHaveLength(3)
  })

  it('preserves rawLine', () => {
    const source = `l_english:\n A:0 "a"\n B:0 "b"\n`
    const result = parse(source)
    expect(result.file.entries[0]?.rawLine).toBe(2)
    expect(result.file.entries[1]?.rawLine).toBe(3)
  })

  it('skips empty lines', () => {
    const source = `l_english:\n\n A:0 "a"\n\n\n B:0 "b"\n`
    const result = parse(source)
    expect(result.file.entries).toHaveLength(2)
  })
})

describe('parse - value content', () => {
  it('preserves escaped quotes in the value', () => {
    const result = parse(`l_english:\n KEY:0 "she said \\"hello\\""\n`)
    expect(result.file.entries[0]?.value).toBe('she said \\"hello\\"')
  })

  it('preserves escape sequences as raw text', () => {
    const result = parse(`l_english:\n KEY:0 "line1\\nline2"\n`)
    expect(result.file.entries[0]?.value).toBe('line1\\nline2')
  })

  it('preserves Paradox color codes verbatim', () => {
    const result = parse(`l_english:\n KEY:0 "§Yyellow§! and £gold£ icon"\n`)
    expect(result.file.entries[0]?.value).toBe('§Yyellow§! and £gold£ icon')
  })

  it('preserves a # inside the value as literal', () => {
    const result = parse(`l_english:\n KEY:0 "hashtag # inside"\n`)
    expect(result.file.entries[0]?.value).toBe('hashtag # inside')
  })

  it('handles empty values', () => {
    const result = parse(`l_english:\n KEY:0 ""\n`)
    expect(result.file.entries[0]?.value).toBe('')
  })

  it('reports unterminated string', () => {
    const result = parse(`l_english:\n KEY:0 "unterminated\n`)
    expect(result.diagnostics.some(d => d.code === 'unterminated-string')).toBe(true)
    expect(result.ok).toBe(false)
  })
})

describe('parse - comments', () => {
  it('skips standalone comment lines', () => {
    const source = `l_english:\n # a comment\n KEY:0 "value"\n`
    const result = parse(source)
    expect(result.file.entries).toHaveLength(1)
  })

  it('captures inline comment on entry', () => {
    const result = parse(`l_english:\n KEY:0 "value" # inline note\n`)
    expect(result.file.entries[0]?.comment).toBe('# inline note')
  })

  it('does not set comment when absent', () => {
    const result = parse(`l_english:\n KEY:0 "value"\n`)
    expect(result.file.entries[0]?.comment).toBeUndefined()
  })

  it('preserves trailing comments after the last entry', () => {
    const source = `l_english:\n KEY:0 "value"\n # trailing\n`
    const result = parse(source)
    expect(result.file.trailingComments).toContain('# trailing')
  })
})

describe('parse - error recovery', () => {
  it('continues after a malformed line and reports diagnostic', () => {
    const source = `l_english:\n GOOD:0 "ok"\n BAD garbage\n GOOD2:0 "ok2"\n`
    const result = parse(source)
    expect(result.file.entries.map(e => e.key)).toEqual(['GOOD', 'GOOD2'])
    expect(result.diagnostics.length).toBeGreaterThan(0)
    expect(result.ok).toBe(false)
  })

  it('reports diagnostic with line number', () => {
    const source = `l_english:\n KEY:0 "ok"\n NOQUOTE:0 missing\n`
    const result = parse(source)
    const diag = result.diagnostics.find(d => d.code === 'expected-quote')
    expect(diag?.line).toBe(3)
  })
})

describe('parse - line endings', () => {
  it('handles CRLF line endings', () => {
    const result = parse(`l_english:\r\n KEY:0 "value"\r\n`)
    expect(result.file.entries).toHaveLength(1)
    expect(result.file.entries[0]?.value).toBe('value')
  })

  it('handles mixed LF and CRLF', () => {
    const result = parse(`l_english:\n KEY:0 "v1"\r\n KEY2:0 "v2"\n`)
    expect(result.file.entries).toHaveLength(2)
  })

  it('detects CRLF and stores it on LocaleFile', () => {
    const result = parse(`l_english:\r\n KEY:0 "v"\r\n`)
    expect(result.file.lineEnding).toBe('\r\n')
  })

  it('detects LF (default) when no \\r\\n is present', () => {
    const result = parse(`l_english:\n KEY:0 "v"\n`)
    expect(result.file.lineEnding).toBe('\n')
  })
})

describe('parse - body layout', () => {
  it('records interleaved comments and entries in order', () => {
    const source = [
      'l_english:',
      '# leading comment',
      ' KEY1:0 "a"',
      '# middle comment',
      ' KEY2:0 "b"',
      '# trailing comment',
      ''
    ].join('\n')
    const result = parse(source)
    expect(result.file.body).toBeDefined()
    const kinds = result.file.body!.map(b => b.kind)
    expect(kinds).toEqual(['comment', 'entry', 'comment', 'entry', 'comment'])
  })

  it('preserves blank lines between entries', () => {
    const source = `l_english:\n KEY1:0 "a"\n\n KEY2:0 "b"\n`
    const result = parse(source)
    const kinds = result.file.body!.map(b => b.kind)
    expect(kinds).toEqual(['entry', 'blank', 'entry'])
  })
})

describe('parse - multi-line values', () => {
  it('parses a value that spans 2 lines', () => {
    const source = `l_english:\n KEY:0 "first line\nsecond line"\n`
    const result = parse(source)
    expect(result.ok).toBe(true)
    expect(result.file.entries).toHaveLength(1)
    expect(result.file.entries[0]?.value).toBe('first line\nsecond line')
  })

  it('parses a value that spans 3 lines', () => {
    const source = `l_english:\n KEY:0 "a\nb\nc"\n`
    const result = parse(source)
    expect(result.ok).toBe(true)
    expect(result.file.entries[0]?.value).toBe('a\nb\nc')
  })

  it('preserves rawLineEnd on multi-line entries', () => {
    const source = `l_english:\n KEY:0 "a\nb\nc"\n NEXT:0 "d"\n`
    const result = parse(source)
    const first = result.file.entries[0]
    expect(first?.rawLine).toBe(2)
    expect(first?.rawLineEnd).toBe(4)
  })

  it('handles escaped quotes inside multi-line values', () => {
    const source = `l_english:\n KEY:0 "she said \\"hi\\"\nand left"\n`
    const result = parse(source)
    expect(result.ok).toBe(true)
    expect(result.file.entries[0]?.value).toBe('she said \\"hi\\"\nand left')
  })

  it('uses the file line ending inside multi-line values (CRLF)', () => {
    const source = `l_english:\r\n KEY:0 "a\r\nb"\r\n`
    const result = parse(source)
    expect(result.ok).toBe(true)
    expect(result.file.entries[0]?.value).toBe('a\r\nb')
  })

  it('reports unterminated string when multi-line value runs to EOF', () => {
    const source = `l_english:\n KEY:0 "never closed\nstill not\n`
    const result = parse(source)
    expect(result.ok).toBe(false)
    expect(result.diagnostics.some(d => d.code === 'unterminated-string')).toBe(true)
  })

  it('continues parsing later entries when a multi-line value closes', () => {
    const source = `l_english:\n KEY1:0 "a\nb"\n KEY2:0 "c"\n`
    const result = parse(source)
    expect(result.ok).toBe(true)
    expect(result.file.entries.map(e => e.key)).toEqual(['KEY1', 'KEY2'])
  })
})
