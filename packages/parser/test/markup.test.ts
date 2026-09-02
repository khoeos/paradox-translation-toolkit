import { describe, expect, it } from 'vitest'

import {
  TOKEN_PATTERN,
  extractTokens,
  hasMarkup,
  isTranslatable,
  maskTokens,
  restoreTokens,
  tokensMatch
} from '../src/markup.js'

describe('TOKEN_PATTERN', () => {
  const cases: Array<[label: string, value: string, tokens: string[]]> = [
    ['variable', 'Cost: $VALUE$', ['$VALUE$']],
    ['empty variable', 'a $$ b', ['$$']],
    ['scope function', 'Ruler [ROOT.Char.GetName]', ['[ROOT.Char.GetName]']],
    ['icon between marks', 'Gain £energy£ now', ['£energy£']],
    ['bare icon word', 'Gain £energy today', ['£energy']],
    ['colour code and reset', '§Yred§!', ['§Y', '§!']],
    ['at-word', 'Portrait @knight!', ['@knight!']],
    ['hash code before space', 'text #bold more', ['#bold']],
    ['hash reset', 'text#!', ['#!']],
    ['literal newline escape', 'first\\nsecond', ['\\n']],
    ['literal tab escape', 'a\\tb', ['\\t']]
  ]

  for (const [label, value, tokens] of cases) {
    it(`matches a ${label}`, () => {
      expect(extractTokens(value)).toEqual(tokens.toSorted())
    })
  }

  it('does not let a variable span lines', () => {
    expect(extractTokens('$open\nclose$')).toEqual([])
  })

  it('does not match a hash code at end of value (no trailing whitespace)', () => {
    expect(extractTokens('text #bold')).toEqual([])
  })

  it('is reusable across calls despite being a global regexp', () => {
    const value = 'a $X$ b'
    expect(extractTokens(value)).toEqual(['$X$'])
    expect(extractTokens(value)).toEqual(['$X$'])
    expect(TOKEN_PATTERN.lastIndex).toBe(0)
  })
})

describe('hasMarkup', () => {
  it('is true for a value carrying markup', () => {
    expect(hasMarkup('Cost: $VALUE$')).toBe(true)
  })

  it('is false for plain text', () => {
    expect(hasMarkup('plain text')).toBe(false)
  })

  it('gives the same answer on repeated calls', () => {
    const value = 'Gain £energy£ now'
    expect(hasMarkup(value)).toBe(true)
    expect(hasMarkup(value)).toBe(true)
    expect(hasMarkup(value)).toBe(true)
  })
})

describe('isTranslatable', () => {
  it('accepts a value with at least two letters', () => {
    expect(isTranslatable('Hello')).toBe(true)
  })

  it('rejects an empty value', () => {
    expect(isTranslatable('')).toBe(false)
  })

  it('rejects a whitespace-only value', () => {
    expect(isTranslatable('   ')).toBe(false)
  })

  it('rejects a value made only of markup', () => {
    expect(isTranslatable('$VALUE$ [ROOT.GetName] £energy£')).toBe(false)
  })

  it('rejects a value made only of numbers and punctuation', () => {
    expect(isTranslatable('12.5% (+3)')).toBe(false)
  })

  it('rejects a single letter surrounded by markup', () => {
    expect(isTranslatable('$X$ a $Y$')).toBe(false)
  })

  it('accepts a value whose letters are outside the markup', () => {
    expect(isTranslatable('Gain $AMOUNT$ energy')).toBe(true)
  })

  it('accepts non-Latin letters', () => {
    expect(isTranslatable('Империя')).toBe(true)
  })

  it('counts letters split by a token as separate runs', () => {
    expect(isTranslatable('a$X$b')).toBe(false)
  })
})

describe('extractTokens', () => {
  it('returns an empty array for a value without markup', () => {
    expect(extractTokens('plain text')).toEqual([])
  })

  it('sorts the tokens so order inside the value does not matter', () => {
    expect(extractTokens('$B$ then $A$')).toEqual(['$A$', '$B$'])
  })

  it('keeps duplicates', () => {
    expect(extractTokens('$A$ and $A$')).toEqual(['$A$', '$A$'])
  })
})

describe('maskTokens', () => {
  it('replaces each token with its index in order of appearance', () => {
    const { masked, tokens } = maskTokens('Gain $AMOUNT$ £energy£ now')
    expect(masked).toBe('Gain {0} {1} now')
    expect(tokens).toEqual(['$AMOUNT$', '£energy£'])
  })

  it('leaves a value without markup untouched', () => {
    const { masked, tokens } = maskTokens('plain text')
    expect(masked).toBe('plain text')
    expect(tokens).toEqual([])
  })

  it('numbers duplicate tokens separately', () => {
    const { masked, tokens } = maskTokens('$A$ and $A$')
    expect(masked).toBe('{0} and {1}')
    expect(tokens).toEqual(['$A$', '$A$'])
  })

  it('round-trips through restoreTokens', () => {
    const source = 'Gain $AMOUNT$ £energy£\\nnow §Ybold§!'
    const { masked, tokens } = maskTokens(source)
    expect(restoreTokens(masked, tokens)).toBe(source)
  })
})

describe('restoreTokens', () => {
  it('puts the tokens back where the placeholders are', () => {
    expect(restoreTokens('Gagnez {0} {1} maintenant', ['$AMOUNT$', '£energy£'])).toBe(
      'Gagnez $AMOUNT$ £energy£ maintenant'
    )
  })

  it('allows the translator to reorder the placeholders', () => {
    expect(restoreTokens('{1} puis {0}', ['$A$', '$B$'])).toBe('$B$ puis $A$')
  })

  it('returns null when a placeholder was dropped', () => {
    expect(restoreTokens('Gagnez maintenant', ['$AMOUNT$'])).toBeNull()
  })

  it('returns null when the service invented a placeholder', () => {
    expect(restoreTokens('{0} et {7}', ['$A$'])).toBeNull()
  })

  it('inserts a token containing $ literally, not as a replacement pattern', () => {
    expect(restoreTokens('{0}', ['$&$'])).toBe('$&$')
    expect(restoreTokens('{0}', ['$$'])).toBe('$$')
  })

  it('accepts an empty token list', () => {
    expect(restoreTokens('plain text', [])).toBe('plain text')
  })

  it('replaces only the first occurrence of a repeated placeholder', () => {
    expect(restoreTokens('{0} and {0}', ['$A$'])).toBeNull()
  })
})

describe('tokensMatch', () => {
  it('accepts a translation that kept every token', () => {
    expect(tokensMatch('Gain $A$ £e£', 'Gagnez $A$ £e£')).toBe(true)
  })

  it('accepts a translation that reordered the tokens', () => {
    expect(tokensMatch('$A$ then $B$', '$B$ puis $A$')).toBe(true)
  })

  it('rejects a translation that lost a token', () => {
    expect(tokensMatch('Gain $A$ £e£', 'Gagnez $A$')).toBe(false)
  })

  it('rejects a translation that mangled a token', () => {
    expect(tokensMatch('Gain £energy£', 'Gagnez £энергии£')).toBe(false)
  })

  it('rejects a translation that invented a token', () => {
    expect(tokensMatch('Gain energy', 'Gagnez $ENERGY$')).toBe(false)
  })

  it('rejects a translation that duplicated a token', () => {
    expect(tokensMatch('$A$', '$A$ $A$')).toBe(false)
  })

  it('accepts two values without markup', () => {
    expect(tokensMatch('plain', 'simple')).toBe(true)
  })
})
