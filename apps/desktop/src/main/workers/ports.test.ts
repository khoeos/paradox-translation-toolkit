import { describe, expect, it, vi } from 'vitest'

import { stellaris } from '@ptt/games'

import { createRunReportPort, createTranslationSetup } from './ports.js'

const setupInputs = {
  jobId: 'job-1',
  game: stellaris,
  signal: new AbortController().signal,
  emit: vi.fn()
}

const reportInputs = {
  rootDir: '/mods',
  gameId: 'stellaris',
  mode: 'create-translation-mod' as const,
  sourceLanguage: 'en' as const,
  targets: [{ language: 'ru', fileToken: 'russian' }],
  targetContent: 'missing-keys' as const,
  engine: () => undefined
}

describe('createTranslationSetup', () => {
  it('opens nothing without a user data path, since the memory lives there', async () => {
    const { port, engine } = createTranslationSetup(setupInputs)
    const setup = await port.open({ sourceLanguage: 'en', targetLanguages: ['ru'] })
    expect(setup).toEqual({})
    expect(engine()).toBeUndefined()
  })
})

describe('createRunReportPort', () => {
  it('is absent without a user data path, which is how a run writes no report', () => {
    expect(createRunReportPort(reportInputs)).toBeUndefined()
  })

  it('is present as soon as there is somewhere to write', () => {
    expect(createRunReportPort({ ...reportInputs, userDataPath: '/data' })).toBeDefined()
  })
})
