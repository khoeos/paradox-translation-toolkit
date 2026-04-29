import { describe, expect, it } from 'vitest'

import { apply, diff, plan, scan } from '../src/index.js'

describe('converter-core skeleton', () => {
  it('exports scan', () => {
    expect(typeof scan).toBe('function')
  })

  it('exports diff', () => {
    expect(typeof diff).toBe('function')
  })

  it('exports plan', () => {
    expect(typeof plan).toBe('function')
  })

  it('exports apply', () => {
    expect(typeof apply).toBe('function')
  })
})
