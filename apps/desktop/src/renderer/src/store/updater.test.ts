import { describe, expect, it } from 'vitest'

import { isUpdateBannerVisible } from './updater.js'

describe('isUpdateBannerVisible', () => {
  it.each([
    ['available', true],
    ['downloading', true],
    ['ready', true],
    ['idle', false],
    ['checking', false],
    ['not-available', false],
    ['error', false]
  ] as const)('is %s -> %s', (status, expected) => {
    expect(isUpdateBannerVisible({ status, dismissed: false })).toBe(expected)
  })

  it('is hidden once dismissed, whatever the status', () => {
    expect(isUpdateBannerVisible({ status: 'available', dismissed: true })).toBe(false)
  })
})
