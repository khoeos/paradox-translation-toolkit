import { describe, expect, it } from 'vitest'

import en from '@ptt/i18n/locales/en'
import { UPDATER_STATUSES } from '@ptt/shared/updater'

import { updaterStatusKey } from './updater-status.js'

describe('updater.statuses labels', () => {
  const labels: Record<string, string> = en.updater.statuses

  it.each(UPDATER_STATUSES)('has a non-empty label for "%s"', status => {
    expect(labels[updaterStatusKey(status)], status).toBeTruthy()
  })

  it('renames only the one status whose key is not its own name', () => {
    const renamed = UPDATER_STATUSES.filter(status => updaterStatusKey(status) !== status)
    expect(renamed).toEqual(['not-available'])
  })
})
