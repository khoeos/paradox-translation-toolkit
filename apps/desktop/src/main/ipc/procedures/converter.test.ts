import { describe, expect, it } from 'vitest'

import { ConvertInputSchema, ScanModsInputSchema } from './converter.js'

const translateConfig = (provider: 'openai' | 'rapidapi') => ({
  enabled: true,
  provider,
  baseUrl: 'https://example.test',
  model: provider === 'openai' ? 'gpt' : '',
  batchSize: 10,
  concurrency: 1,
  retries: 1,
  timeout: 30_000
})

const scanModsBase = {
  gameId: 'hoi4',
  rootDir: '/mods',
  sourceLanguage: 'en',
  targets: [{ language: 'fr', fileToken: 'french' }]
}

const convertBase = {
  ...scanModsBase,
  mode: 'create-translation-mod'
}

describe('ScanModsInputSchema', () => {
  it('accepts a built-in target', () => {
    expect(ScanModsInputSchema.safeParse(scanModsBase).success).toBe(true)
  })

  it('normalizes a recognized free-text language before validating (R2)', () => {
    const result = ScanModsInputSchema.safeParse({
      ...scanModsBase,
      targets: [{ language: 'French', fileToken: 'french' }]
    })
    expect(result.success).toBe(true)
  })

  it('rejects a file token the game does not declare (R1)', () => {
    const result = ScanModsInputSchema.safeParse({
      ...scanModsBase,
      targets: [{ language: 'fr', fileToken: 'klingon' }]
    })
    expect(result.success).toBe(false)
  })

  it('refuses with a sentence, not with the problem code', () => {
    const result = ScanModsInputSchema.safeParse({
      ...scanModsBase,
      targets: [{ language: 'fr', fileToken: 'klingon' }]
    })
    const message = result.success ? '' : (result.error.issues[0]?.message ?? '')
    expect(message).toContain('l_klingon')
    expect(message).not.toContain('unknown-token')
  })

  it('accepts a free-text language with a declared token', () => {
    const result = ScanModsInputSchema.safeParse({
      ...scanModsBase,
      targets: [{ language: 'Catalan', fileToken: 'english' }]
    })
    expect(result.success).toBe(true)
  })

  it('rejects two targets that normalize to the same language', () => {
    const result = ScanModsInputSchema.safeParse({
      ...scanModsBase,
      targets: [
        { language: 'Turkish', fileToken: 'turkish' },
        { language: 'tr', fileToken: 'french' }
      ]
    })
    expect(result.success).toBe(false)
  })

  it('rejects an unrecognized language when the provider is RapidAPI', () => {
    const result = ScanModsInputSchema.safeParse({
      ...scanModsBase,
      targets: [{ language: 'Catalan', fileToken: 'english' }],
      translate: translateConfig('rapidapi')
    })
    expect(result.success).toBe(false)
  })

  it('accepts an unrecognized language when the provider is not RapidAPI', () => {
    const result = ScanModsInputSchema.safeParse({
      ...scanModsBase,
      targets: [{ language: 'Catalan', fileToken: 'english' }],
      translate: translateConfig('openai')
    })
    expect(result.success).toBe(true)
  })
})

describe('ConvertInputSchema', () => {
  it('accepts a built-in target', () => {
    expect(ConvertInputSchema.safeParse(convertBase).success).toBe(true)
  })

  it('accepts a shadowing target in add-to-current with Complete file, R3', () => {
    const result = ConvertInputSchema.safeParse({
      ...convertBase,
      mode: 'add-to-current',
      targetContent: 'complete-file',
      targets: [{ language: 'Catalan', fileToken: 'english' }]
    })
    expect(result.success).toBe(true)
  })

  it('accepts a shadowing target in add-to-current with Only missing keys, when the token is not the source token', () => {
    const result = ConvertInputSchema.safeParse({
      ...convertBase,
      mode: 'add-to-current',
      targetContent: 'missing-keys',
      targets: [{ language: 'Catalan', fileToken: 'french' }]
    })
    expect(result.success).toBe(true)
  })

  it('rejects the provable no-op: add-to-current, Only missing keys, source token', () => {
    const result = ConvertInputSchema.safeParse({
      ...convertBase,
      mode: 'add-to-current',
      targetContent: 'missing-keys',
      targets: [{ language: 'Catalan', fileToken: 'english' }]
    })
    expect(result.success).toBe(false)
  })

  it('rejects the provable no-op with the default targetContent (missing-keys)', () => {
    const result = ConvertInputSchema.safeParse({
      ...convertBase,
      mode: 'add-to-current',
      targets: [{ language: 'Catalan', fileToken: 'english' }]
    })
    expect(result.success).toBe(false)
  })

  it('does not apply the no-op rule outside add-to-current', () => {
    const result = ConvertInputSchema.safeParse({
      ...convertBase,
      mode: 'create-translation-mod',
      targetContent: 'missing-keys',
      targets: [{ language: 'Catalan', fileToken: 'english' }]
    })
    expect(result.success).toBe(true)
  })

  it('rejects an unknown file token (R1)', () => {
    const result = ConvertInputSchema.safeParse({
      ...convertBase,
      targets: [{ language: 'fr', fileToken: 'klingon' }]
    })
    expect(result.success).toBe(false)
  })

  it('rejects RapidAPI with an unrecognized target language, before the run starts', () => {
    const result = ConvertInputSchema.safeParse({
      ...convertBase,
      targets: [{ language: 'Catalan', fileToken: 'english' }],
      translate: translateConfig('rapidapi')
    })
    expect(result.success).toBe(false)
  })
})
