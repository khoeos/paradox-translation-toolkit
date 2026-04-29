import { describe, expect, it } from 'vitest'

import { buildFilename, parse, parseFilename, serialize } from '../src/index.js'

describe('parser-core skeleton', () => {
  it('exports parse', () => {
    expect(typeof parse).toBe('function')
  })

  it('exports serialize', () => {
    expect(typeof serialize).toBe('function')
  })

  it('exports parseFilename', () => {
    expect(typeof parseFilename).toBe('function')
  })

  it('buildFilename returns the canonical Paradox naming convention', () => {
    expect(buildFilename('mymod', 'french')).toBe('mymod_l_french.yml')
  })
})
