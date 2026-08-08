import { describe, expect, it } from 'vitest'

import en from '@ptt/i18n/locales/en'

/**
 * Every job status the store can hold has a label.
 *
 * The modal renders `t('modal.status.' + job.status)`, which the extractor cannot see, so a new
 * status ships as a raw key on screen unless something asserts otherwise.
 */
const STATUSES = [
  'idle',
  'scanning',
  'processing-mods',
  'translating',
  'applying',
  'scan-finished',
  'done',
  'error',
  'cancelled'
] as const

describe('modal.status labels', () => {
  const labels: Record<string, string> = en.modal.status

  for (const status of STATUSES) {
    // `idle` is never displayed: the modal only opens once a job exists.
    if (status === 'idle') continue
    it(`has a label for "${status}"`, () => {
      expect(labels[status], status).toBeTruthy()
    })
  }
})
