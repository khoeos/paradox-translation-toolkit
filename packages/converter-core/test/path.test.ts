import { describe, expect, it } from 'vitest'

import {
  posixBasename,
  posixContains,
  posixDirname,
  posixJoin,
  posixNormalize,
  posixNormalizeStrict,
  posixSplit
} from '../src/path.js'

describe('posixJoin', () => {
  it('joins simple parts with /', () => {
    expect(posixJoin('a', 'b', 'c')).toBe('a/b/c')
  })

  it('handles trailing and leading slashes between parts', () => {
    expect(posixJoin('a/', '/b/', '/c')).toBe('a/b/c')
  })

  it('preserves leading slash on first part', () => {
    expect(posixJoin('/abs', 'rel')).toBe('/abs/rel')
  })

  it('skips empty parts', () => {
    expect(posixJoin('a', '', 'b')).toBe('a/b')
  })

  it('normalises Windows backslashes to forward slashes', () => {
    expect(posixJoin('C:\\Users\\foo', 'bar')).toBe('C:/Users/foo/bar')
  })

  it('returns empty for no parts', () => {
    expect(posixJoin()).toBe('')
  })
})

describe('posixDirname', () => {
  it('returns the parent directory', () => {
    expect(posixDirname('a/b/c.yml')).toBe('a/b')
  })

  it('returns empty for a single segment', () => {
    expect(posixDirname('file.yml')).toBe('')
  })

  it('handles backslashes', () => {
    expect(posixDirname('a\\b\\c.yml')).toBe('a/b')
  })
})

describe('posixBasename', () => {
  it('returns the file name', () => {
    expect(posixBasename('a/b/c.yml')).toBe('c.yml')
  })

  it('returns the full string when no slash', () => {
    expect(posixBasename('only.yml')).toBe('only.yml')
  })
})

describe('posixSplit', () => {
  it('splits on /', () => {
    expect(posixSplit('a/b/c')).toEqual(['a', 'b', 'c'])
  })

  it('drops empty segments', () => {
    expect(posixSplit('/a//b/')).toEqual(['a', 'b'])
  })

  it('normalises backslashes', () => {
    expect(posixSplit('a\\b\\c')).toEqual(['a', 'b', 'c'])
  })
})

describe('posixNormalize', () => {
  it('collapses . segments', () => {
    expect(posixNormalize('a/./b/./c')).toBe('a/b/c')
  })

  it('resolves .. against the previous segment', () => {
    expect(posixNormalize('a/b/../c')).toBe('a/c')
  })

  it('preserves leading .. on relative paths', () => {
    expect(posixNormalize('../etc/passwd')).toBe('../etc/passwd')
  })

  it('drops .. that would escape an absolute root', () => {
    expect(posixNormalize('/a/../../etc')).toBe('/etc')
  })

  it('keeps absolute paths absolute', () => {
    expect(posixNormalize('/a/b/c')).toBe('/a/b/c')
  })
})

describe('posixNormalizeStrict', () => {
  it('returns a normalised path when no traversal segments are present', () => {
    expect(posixNormalizeStrict('mod/localisation/foo_l_french.yml')).toBe(
      'mod/localisation/foo_l_french.yml'
    )
  })

  it('preserves the leading slash on absolute paths', () => {
    expect(posixNormalizeStrict('/output/mod/foo.yml')).toBe('/output/mod/foo.yml')
  })

  it('throws on a .. segment', () => {
    expect(() => posixNormalizeStrict('mod/../etc/passwd')).toThrow(/traversal/)
  })

  it('throws on a leading .. segment', () => {
    expect(() => posixNormalizeStrict('../etc/passwd')).toThrow(/traversal/)
  })

  it('throws on a . segment', () => {
    expect(() => posixNormalizeStrict('mod/./foo')).toThrow(/traversal/)
  })

  it('normalises backslashes', () => {
    expect(posixNormalizeStrict('mod\\localisation\\foo.yml')).toBe('mod/localisation/foo.yml')
  })
})

describe('posixContains', () => {
  it('returns true for the same path', () => {
    expect(posixContains('mod', 'mod')).toBe(true)
  })

  it('returns true for a descendant', () => {
    expect(posixContains('mod', 'mod/localisation/foo.yml')).toBe(true)
  })

  it('returns false for a sibling', () => {
    expect(posixContains('mod', 'mod-evil/foo.yml')).toBe(false)
  })

  it('rejects .. traversal that escapes the parent', () => {
    expect(posixContains('mod/localisation', 'mod/localisation/../../etc/passwd')).toBe(false)
  })

  it('accepts .. traversal that stays inside the parent', () => {
    expect(posixContains('mod', 'mod/foo/../bar.yml')).toBe(true)
  })

  it('handles absolute parents and children', () => {
    expect(posixContains('/output', '/output/mod/foo.yml')).toBe(true)
    expect(posixContains('/output', '/other/mod/foo.yml')).toBe(false)
  })
})
