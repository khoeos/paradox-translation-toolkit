import { describe, expect, it } from 'vitest'

import en from '@ptt/i18n/locales/en'

const STATUSES = [
  'idle',
  'scanning',
  'processing-mods',
  'translating',
  'scan-finished',
  'done',
  'error',
  'cancelled'
] as const

describe('modal.status labels', () => {
  const labels: Record<string, string> = en.modal.status

  for (const status of STATUSES) {
    if (status === 'idle') continue
    it(`has a label for "${status}"`, () => {
      expect(labels[status], status).toBeTruthy()
    })
  }
})
