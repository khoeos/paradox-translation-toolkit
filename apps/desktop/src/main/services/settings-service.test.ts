import { describe, expect, it } from 'vitest'

import { migrateSettings } from './settings-service.js'

describe('migrateSettings', () => {
  it('maps the legacy overwrite:true to complete-file, not regenerate-file', () => {
    expect(migrateSettings({ overwrite: true })).toEqual({ targetContent: 'complete-file' })
  })

  it('maps the legacy overwrite:false to missing-keys', () => {
    expect(migrateSettings({ overwrite: false })).toEqual({ targetContent: 'missing-keys' })
  })

  it('returns an empty patch when the legacy key is absent, leaving the default to apply', () => {
    expect(migrateSettings({ mode: 'add-to-current' })).toEqual({})
  })

  it('returns an empty patch when overwrite is present but not a boolean', () => {
    expect(migrateSettings({ overwrite: 'true' })).toEqual({})
    expect(migrateSettings({ overwrite: 1 })).toEqual({})
    expect(migrateSettings({ overwrite: null })).toEqual({})
  })

  it('returns an empty patch when raw is not an object', () => {
    expect(migrateSettings(null)).toEqual({})
    expect(migrateSettings(undefined)).toEqual({})
    expect(migrateSettings('overwrite')).toEqual({})
    expect(migrateSettings(42)).toEqual({})
  })
})
