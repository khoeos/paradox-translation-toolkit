import { describe, expect, it } from 'vitest'

import { parse } from '../src/parser.js'
import { serialize } from '../src/serializer.js'

const BOM = '﻿'
const NBSP = '\u00A0'
const ZWSP = '\u200B'

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

  it('accepts a version number on the header line', () => {
    const result = parse(`l_english:0\n KEY:0 "value"\n`)
    expect(result.ok).toBe(true)
    expect(result.file.language).toBe('english')
  })

  it('accepts blanks around the header colon, version and comment', () => {
    const result = parse(`l_english \t: \t 12 \t # c\n KEY:0 "value"\n`)
    expect(result.ok).toBe(true)
    expect(result.file.language).toBe('english')
  })

  it('stays linear on a header line padded with blanks', () => {
    const start = Date.now()
    const result = parse(`l_english:${' '.repeat(50_000)}x\n`)
    expect(result.ok).toBe(false)
    expect(result.diagnostics.some(d => d.code === 'no-header')).toBe(true)
    expect(Date.now() - start).toBeLessThan(500)
  })

  it('stays linear on an entry line made of blanks', () => {
    const blanks = ' '.repeat(2_000)
    const start = Date.now()
    const result = parse(`l_english:\n${blanks}\t${blanks}:${blanks}\n${blanks}k${blanks}\n`)
    expect(result.ok).toBe(false)
    expect(result.diagnostics.map(d => d.code)).toEqual(['expected-key', 'expected-colon'])
    expect(Date.now() - start).toBeLessThan(500)
  })

  it('accepts a comment on the header line', () => {
    const result = parse(`l_english: # c\n KEY:0 "value"\n`)
    expect(result.ok).toBe(true)
    expect(result.file.language).toBe('english')
  })

  it('accepts a space before the header colon', () => {
    const result = parse(`l_german :\n KEY:0 "value"\n`)
    expect(result.ok).toBe(true)
    expect(result.file.language).toBe('german')
  })

  it('reports a broken header once, not once per line', () => {
    const result = parse(`l_japanese.:\n KEY1:0 "a"\n KEY2:0 "b"\n KEY3:0 "c"\n`)
    expect(result.ok).toBe(false)
    expect(result.diagnostics.filter(d => d.code === 'no-header')).toHaveLength(1)
    expect(result.diagnostics.filter(d => d.code === 'missing-header')).toHaveLength(1)
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

  it('stops the value at the first unescaped quote, not the last one on the line', () => {
    const result = parse(`l_english:\n KEY:0 "a" # see "b"\n`)
    expect(result.ok).toBe(true)
    expect(result.file.entries[0]?.value).toBe('a')
    expect(result.file.entries[0]?.comment).toBe('# see "b"')
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

  it.each([
    ['l_english:\n 40kmega_hive_planet\n', 'expected-colon', 'skipped (the game skips it too)'],
    ['l_english:\n KEY:0 missing\n', 'expected-quote', 'skipped (the game skips it too)'],
    ['l_english:\n : "orphan"\n', 'expected-key', 'skipped (the game skips it too)'],
    ['l_english:\n KEY:0 "runs off\n', 'unterminated-string', 'line skipped'],
    ['stray line\nl_english:\n KEY:0 "v"\n', 'no-header', 'the game reads nothing above it'],
    ['just notes\n', 'missing-header', 'none of its keys can be read']
  ])('says what was dropped, not only what was expected (%#)', (source, code, said) => {
    const diag = parse(source).diagnostics.find(d => d.code === code)
    expect(diag?.message).toContain(said)
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

  describe('a runaway value that meets the next entry head', () => {
    it('keeps the next key instead of swallowing it', () => {
      const source = `l_english:\n KEY1:0 "unterminated, no closing quote here\n KEY2:0 "value2"\n`
      const result = parse(source)
      expect(result.file.entries.map(e => e.key)).toEqual(['KEY2'])
      expect(result.file.entries[0]?.value).toBe('value2')
    })

    it('reports the unread line rather than parsing clean', () => {
      const source = `l_english:\n KEY1:0 "unterminated, no closing quote here\n KEY2:0 "value2"\n`
      const result = parse(source)
      const diag = result.diagnostics.find(d => d.code === 'unterminated-string')
      expect(diag?.line).toBe(2)
      expect(diag?.message).toContain('KEY2')
      expect(diag?.message).toContain('line skipped')
      expect(result.ok).toBe(false)
    })

    it('keeps the blank and comment lines in between out of the value', () => {
      const source = [
        'l_english:',
        ' legend_royce_bolton_desc:0 "The Boltons never forgot.',
        '',
        '#lannister legends',
        ' legend_the_clever:0 "Tale of Tricksters"',
        ''
      ].join('\n')
      const result = parse(source)
      expect(result.file.entries.map(e => e.key)).toEqual(['legend_the_clever'])
      expect(result.file.entries[0]?.value).toBe('Tale of Tricksters')
      expect(result.file.body?.map(b => b.kind)).toEqual(['blank', 'comment', 'entry'])
      expect(result.diagnostics.map(d => d.code)).toEqual(['unterminated-string'])
    })

    it('still reads a well-formed multi-line value followed by an entry', () => {
      const source = `l_english:\n KEY1:0 "first line\nsecond line"\n KEY2:0 "value2"\n`
      const result = parse(source)
      expect(result.ok).toBe(true)
      expect(result.file.entries.map(e => e.key)).toEqual(['KEY1', 'KEY2'])
      expect(result.file.entries[0]?.value).toBe('first line\nsecond line')
    })
  })
})

describe('parse - shapes the game accepts', () => {
  it('accepts an apostrophe in the key', () => {
    const result = parse(`l_braz_por:\n NAME_Jackson's_Planet: "Planeta de Jackson"\n`)
    expect(result.ok).toBe(true)
    expect(result.file.entries[0]?.key).toBe("NAME_Jackson's_Planet")
  })

  it('accepts a non-breaking space as indentation, and keeps it out of the key', () => {
    const result = parse(`l_english:\n${NBSP}${NBSP}d_ice_crust_desc: "A natural cave."\n`)
    expect(result.ok).toBe(true)
    expect(result.file.entries[0]?.key).toBe('d_ice_crust_desc')
    expect(result.file.entries[0]?.value).toBe('A natural cave.')
  })

  it('accepts a space before the colon', () => {
    const result = parse(`l_english:\n key : "x"\n`)
    expect(result.ok).toBe(true)
    expect(result.file.entries[0]).toEqual({ key: 'key', version: null, value: 'x', rawLine: 2 })
  })

  it('accepts a space before the colon with a version right after it', () => {
    const result = parse(`l_english:\n key :0 "x"\n`)
    expect(result.ok).toBe(true)
    expect(result.file.entries[0]?.key).toBe('key')
    expect(result.file.entries[0]?.version).toBe(0)
  })

  it('accepts a space before the version number', () => {
    const result = parse(`l_english:\n KEY: 2 "x"\n`)
    expect(result.ok).toBe(true)
    expect(result.file.entries[0]?.version).toBe(2)
    expect(result.file.entries[0]?.value).toBe('x')
  })

  it('keeps an interior space inside the key', () => {
    const result = parse(
      `l_english:\n war_goal_wg_gpm_r_pulsestone AAAA_desc:0 "Pulsestone extraction"\n`
    )
    expect(result.ok).toBe(true)
    expect(result.file.entries[0]?.key).toBe('war_goal_wg_gpm_r_pulsestone AAAA_desc')
  })

  it('accepts non-ASCII letters in the key', () => {
    const result = parse(`l_english:\n FW_text_待修:0 "x"\n`)
    expect(result.ok).toBe(true)
    expect(result.file.entries[0]?.key).toBe('FW_text_待修')
  })

  it('accepts zero-width characters before the value', () => {
    const result = parse(`l_english:\n tech_comm_hub:0 ${ZWSP}${ZWSP}"Comm hub"\n`)
    expect(result.ok).toBe(true)
    expect(result.file.entries[0]?.value).toBe('Comm hub')
  })
})

describe('parse - lines that stay refused', () => {
  it('refuses a junk marker between the colon and the version', () => {
    const result = parse(`l_english:\n KEY:. 0 "x"\n`)
    expect(result.ok).toBe(false)
    expect(result.file.entries).toHaveLength(0)
  })

  it('refuses a value with no opening quote', () => {
    const result = parse(`l_english:\n ACOT_SC_GUNSHIP_4_DESC: Gunship"\n`)
    expect(result.ok).toBe(false)
    expect(result.file.entries).toHaveLength(0)
  })

  it('refuses a bare continuation line of an unterminated string', () => {
    const result = parse(`l_english:\n LEthique Libertaire§!"\n`)
    expect(result.ok).toBe(false)
    expect(result.file.entries).toHaveLength(0)
  })

  it('refuses a key containing a quote', () => {
    const result = parse(`l_english:\n key"weird:0 "x"\n`)
    expect(result.ok).toBe(false)
    expect(result.file.entries).toHaveLength(0)
  })

  it('refuses a line whose key is only filler', () => {
    const result = parse(`l_english:\n  : "x"\n`)
    expect(result.ok).toBe(false)
    expect(result.file.entries).toHaveLength(0)
  })
})

describe('parse - round-trip over the tolerated shapes', () => {
  const source = [
    `${BOM}l_english:0`,
    ` NAME_Jackson's_Planet: "Planeta de Jackson"`,
    `${NBSP}d_ice_crust_desc: "A cave with a \\"thick\\" ice layer"`,
    ` key : "x" # note`,
    ` KEY: 2 "§Yyellow§!"`,
    ` war_goal_wg_gpm_r_pulsestone AAAA_desc:0 "Pulsestone"`,
    ` FW_text_待修:0 "x"`,
    ` tech_comm_hub:0 ${ZWSP}"Comm hub"`,
    ''
  ].join('\r\n')

  it('parses every line of the sample', () => {
    const result = parse(source)
    expect(result.ok).toBe(true)
    expect(result.file.entries).toHaveLength(7)
  })

  it('preserves the BOM, the line ending and the escapes', () => {
    const output = serialize(parse(source).file)
    expect(output.startsWith(BOM)).toBe(true)
    expect(output.includes('\r\n')).toBe(true)
    expect(output.includes('\n')).toBe(true)
    expect(output).toContain('A cave with a \\"thick\\" ice layer')
    expect(output).toContain('§Yyellow§!')
    expect(output).toContain('# note')
  })

  it('is stable: a second round-trip changes nothing', () => {
    const once = serialize(parse(source).file)
    expect(serialize(parse(once).file)).toBe(once)
  })

  it('normalises the separator and the indent it just learned to read', () => {
    const output = serialize(parse(source).file)
    expect(output).toContain(' key: "x" # note')
    expect(output).toContain(' d_ice_crust_desc:')
    expect(output.includes(NBSP)).toBe(false)
    expect(output.includes(ZWSP)).toBe(false)
  })
})
