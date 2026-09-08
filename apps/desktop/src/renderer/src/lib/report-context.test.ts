import { describe, expect, it } from 'vitest'

import {
  formatReportJobs,
  formatReportPage,
  formatReportPaths,
  formatReportSettings,
  type ReportSettingsView
} from './report-context'

const settings: ReportSettingsView = {
  defaultSourceLanguage: 'en',
  sourceLanguage: { stellaris: 'en' },
  targetLanguages: { stellaris: ['fr', 'de'] },
  mode: 'add-to-current',
  targetContent: 'missing-keys',
  themeOverride: 'system',
  uiLanguage: 'en',
  lastGameId: 'stellaris',
  autoCheckUpdates: true,
  updateChannel: 'stable',
  lastModFolder: { stellaris: '/home/me/mods' },
  lastOutputFolder: { stellaris: '/home/me/out' },
  gamePath: { stellaris: '/games/stellaris' },
  userAllowedFolders: ['/home/me/allowed']
}

describe('formatReportPage', () => {
  it('appends the selected game when present', () => {
    expect(formatReportPage('/', 'stellaris')).toBe('/ (game: stellaris)')
  })

  it('returns just the path when no game is selected', () => {
    expect(formatReportPage('/settings', null)).toBe('/settings')
  })
})

describe('formatReportSettings', () => {
  it('includes non-sensitive settings but never file paths', () => {
    const out = formatReportSettings(settings)
    expect(out).toContain('Mode: add-to-current')
    expect(out).toContain('Target langs: stellaris=fr+de')
    expect(out).not.toContain('/home/me')
    expect(out).not.toContain('/games/stellaris')
  })
})

describe('formatReportPaths', () => {
  it('collects every configured path', () => {
    const out = formatReportPaths(settings)
    expect(out).toContain('/home/me/mods')
    expect(out).toContain('/home/me/out')
    expect(out).toContain('/games/stellaris')
    expect(out).toContain('/home/me/allowed')
  })

  it('returns an empty string when nothing is configured', () => {
    expect(
      formatReportPaths({
        ...settings,
        lastModFolder: {},
        lastOutputFolder: {},
        gamePath: {},
        userAllowedFolders: []
      })
    ).toBe('')
  })
})

describe('formatReportJobs', () => {
  it('summarizes counts and appends the error only for failed jobs', () => {
    const out = formatReportJobs([
      { status: 'done', modsProcessed: 3, modsTotal: 3, errorMessage: null },
      { status: 'error', modsProcessed: 1, modsTotal: 4, errorMessage: 'boom' }
    ])
    expect(out[0]).toBe('done - 3/3 mods')
    expect(out[1]).toBe('error - 1/4 mods - boom')
  })
})
