import { describe, expect, it } from 'vitest'

import { applyModJobs, planMod, runConvert, scanMods } from '../src/index.js'

describe('converter skeleton', () => {
  it('exports scanMods', () => {
    expect(typeof scanMods).toBe('function')
  })

  it('exports planMod', () => {
    expect(typeof planMod).toBe('function')
  })

  it('exports applyModJobs', () => {
    expect(typeof applyModJobs).toBe('function')
  })

  it('exports runConvert', () => {
    expect(typeof runConvert).toBe('function')
  })
})
