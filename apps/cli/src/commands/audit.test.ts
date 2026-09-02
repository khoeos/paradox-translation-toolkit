import { describe, expect, it } from 'vitest'

import { STATE_LABEL, STATE_ORDER } from './audit.js'

describe('STATE_ORDER', () => {
  it('holds every state a key can be in', () => {
    expect(STATE_ORDER.toSorted()).toEqual(Object.keys(STATE_LABEL).toSorted())
  })

  it('lists each state once', () => {
    expect(new Set(STATE_ORDER).size).toBe(STATE_ORDER.length)
  })
})
