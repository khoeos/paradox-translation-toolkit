import { describe, expect, it } from 'vitest'

import { PROVIDER_DEFAULTS } from '@ptt/translate/defaults'

import { estimateDuration } from './estimate.js'

describe('estimateDuration', () => {
  it('reads in seconds for a short run', () => {
    expect(estimateDuration(30, 3)).toEqual({ value: 10, unit: 'second' })
  })

  it('switches to minutes once seconds stop reading well', () => {
    expect(estimateDuration(600, 3)).toEqual({ value: 3, unit: 'minute' })
  })

  it('switches to hours for an overnight run', () => {
    expect(estimateDuration(40_000, 3)).toEqual({ value: 4, unit: 'hour' })
  })

  it('tells minutes from hours, which is the only thing it promises', () => {
    const local = estimateDuration(40_000, PROVIDER_DEFAULTS.ollama.linesPerSecond)
    const hosted = estimateDuration(40_000, PROVIDER_DEFAULTS.rapidapi.linesPerSecond)
    expect(local.unit).toBe('hour')
    expect(hosted.unit).toBe('minute')
  })

  it('rounds up, so it never claims a run takes no time', () => {
    expect(estimateDuration(1, 60)).toEqual({ value: 1, unit: 'second' })
  })

  it('survives a rate of zero rather than dividing by it', () => {
    expect(estimateDuration(60, 0)).toEqual({ value: 60, unit: 'second' })
  })

  it('is zero for nothing to translate', () => {
    expect(estimateDuration(0, 3)).toEqual({ value: 0, unit: 'second' })
  })
})
