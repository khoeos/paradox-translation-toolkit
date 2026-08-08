import { describe, expect, it } from 'vitest'

import {
  pathKey,
  posixBasename,
  posixContains,
  posixDirname,
  posixIsAbsolute,
  posixJoin,
  posixNormalize,
  posixNormalizeStrict,
  posixRejoin,
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

  it('keeps the root when the first part is only a separator', () => {
    // '/' trims to the empty string, so the root has to be carried outside the segments.
    expect(posixJoin('/', 'mod', 'foo.yml')).toBe('/mod/foo.yml')
  })

  it('keeps the root when a leading empty part precedes an absolute one', () => {
    expect(posixJoin('', '/abs', 'rel')).toBe('/abs/rel')
  })

  it('composes an absolute mod root with a relative target', () => {
    expect(posixJoin('/Users/x/mod', 'localisation/french/foo_l_french.yml')).toBe(
      '/Users/x/mod/localisation/french/foo_l_french.yml'
    )
  })
})

describe('posixIsAbsolute', () => {
  it('is true for a rooted POSIX path', () => {
    expect(posixIsAbsolute('/Users/x/mod')).toBe(true)
  })

  it('is false for a relative path', () => {
    expect(posixIsAbsolute('workshop/mod')).toBe(false)
  })

  it('is false for a Windows drive path, which carries no leading separator', () => {
    expect(posixIsAbsolute('C:/Users/x/mod')).toBe(false)
    expect(posixIsAbsolute('C:\\Users\\x\\mod')).toBe(false)
  })

  it('is true for a backslash-rooted path', () => {
    expect(posixIsAbsolute('\\Users\\x')).toBe(true)
  })
})

describe('posixRejoin', () => {
  it('carries the root separator of an absolute source', () => {
    const source = '/Users/x/mod/localisation/f_l_english.yml'
    expect(posixRejoin(source, posixSplit(source).slice(0, 3))).toBe('/Users/x/mod')
  })

  it('leaves a relative source relative', () => {
    const source = 'workshop/mod/localisation/f_l_english.yml'
    expect(posixRejoin(source, posixSplit(source).slice(0, 2))).toBe('workshop/mod')
  })

  it('leaves a Windows drive path untouched', () => {
    const source = 'C:/Users/x/mod/localisation/f_l_english.yml'
    expect(posixRejoin(source, posixSplit(source).slice(0, 4))).toBe('C:/Users/x/mod')
  })

  it('returns the bare root when no segments are kept from an absolute source', () => {
    expect(posixRejoin('/localisation/f_l_english.yml', [])).toBe('/')
  })

  it('returns empty when no segments are kept from a relative source', () => {
    expect(posixRejoin('localisation/f_l_english.yml', [])).toBe('')
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

describe('pathKey', () => {
  it('normalises the separator', () => {
    expect(pathKey('mod\\localisation\\foo_l_english.yml')).toBe(
      'mod/localisation/foo_l_english.yml'
    )
  })

  it('collapses repeated separators', () => {
    expect(pathKey('mod//loc\\\\foo.yml')).toBe('mod/loc/foo.yml')
  })

  it('lowercases, so two spellings of the same file compare equal', () => {
    expect(pathKey('Mod/Localisation/Foo_l_English.yml')).toBe(
      pathKey('mod\\localisation\\foo_l_english.yml')
    )
  })

  it('leaves . and .. alone', () => {
    // Identity comparison of well-formed paths: resolving here would change what compares
    // equal, and callers that need resolution have posixNormalize.
    expect(pathKey('a/./b/../c')).toBe('a/./b/../c')
  })

  it('keeps a leading separator', () => {
    expect(pathKey('/abs/path')).toBe('/abs/path')
  })
})
