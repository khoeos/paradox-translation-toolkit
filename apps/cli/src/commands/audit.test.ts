import { describe, expect, it } from 'vitest'

import type { KeyReport } from '@ptt/converter'

import { noteFor, STATE_LABEL, STATE_ORDER } from './audit.js'

describe('STATE_ORDER', () => {
  it('holds every state a key can be in', () => {
    expect(STATE_ORDER.toSorted()).toEqual(Object.keys(STATE_LABEL).toSorted())
  })

  it('lists each state once', () => {
    expect(new Set(STATE_ORDER).size).toBe(STATE_ORDER.length)
  })
})

const baseKey: KeyReport = {
  modId: 'm1',
  modName: 'Mod',
  language: 'tr',
  key: 'k',
  file: 'f.yml',
  source: 'text',
  state: 'missing'
}

describe('noteFor', () => {
  it('notes a key written under a token other than the language own', () => {
    const key: KeyReport = { ...baseKey, fileToken: 'english' }
    expect(noteFor(key, { en: 'english' })).toContain('written as l_english')
  })

  it('says nothing extra when the token is the language own', () => {
    const key: KeyReport = { ...baseKey, fileToken: 'turkish' }
    expect(noteFor(key, { tr: 'turkish' })).toBe('')
  })

  it('still flags shadowed keys ahead of the token note', () => {
    const key: KeyReport = { ...baseKey, fileToken: 'english', shadowed: true }
    expect(noteFor(key, { en: 'english' })).toContain('shadowed by us')
  })

  it('still flags markup-only keys ahead of the token note', () => {
    const key: KeyReport = { ...baseKey, fileToken: 'english', markupOnly: true }
    expect(noteFor(key, { en: 'english' })).toContain('markup only')
  })

  it('falls back to the reason when there is no custom token', () => {
    const key: KeyReport = { ...baseKey, reason: 'left as-is' }
    expect(noteFor(key, {})).toBe('left as-is')
  })

  it('notes a free-text language, which never owns a token', () => {
    const key: KeyReport = { ...baseKey, language: 'Catalan', fileToken: 'english' }
    expect(noteFor(key, { en: 'english' })).toContain('written as l_english')
  })
})
