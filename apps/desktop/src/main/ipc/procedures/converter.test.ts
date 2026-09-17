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
  targets: [{ language: 'fr', fileToken: 'french' }],
  mode: 'create-translation-mod'
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

  it('accepts retranslateOwnKeys', () => {
    const result = ScanModsInputSchema.safeParse({ ...scanModsBase, retranslateOwnKeys: true })
    expect(result.success).toBe(true)
  })

  it('defaults retranslateOwnKeys to absent when omitted', () => {
    const result = ScanModsInputSchema.safeParse(scanModsBase)
    expect(result.success && result.data.retranslateOwnKeys).toBeUndefined()
  })

  it('accepts mode and targetContent', () => {
    const result = ScanModsInputSchema.safeParse({
      ...scanModsBase,
      mode: 'add-to-current',
      targetContent: 'complete-file'
    })
    expect(result.success).toBe(true)
  })

  it('rejects an unrecognized mode', () => {
    const result = ScanModsInputSchema.safeParse({ ...scanModsBase, mode: 'nonsense' })
    expect(result.success).toBe(false)
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

  it('accepts retranslateOwnKeys', () => {
    const result = ConvertInputSchema.safeParse({ ...convertBase, retranslateOwnKeys: true })
    expect(result.success).toBe(true)
  })
})

describe('the two schemas agree on what a usable target list is', () => {
  const cases = [
    {
      name: 'a target that would write nothing into the source file',
      over: {
        mode: 'add-to-current',
        targetContent: 'missing-keys',
        targets: [{ language: 'fr', fileToken: 'english' }]
      },
      accepted: false
    },
    {
      name: 'that same target once the whole file is rewritten',
      over: {
        mode: 'add-to-current',
        targetContent: 'complete-file',
        targets: [{ language: 'fr', fileToken: 'english' }]
      },
      accepted: true
    },
    {
      name: 'a free-text language RapidAPI cannot reach',
      over: {
        targets: [{ language: 'Catalan', fileToken: 'english' }],
        translate: translateConfig('rapidapi')
      },
      accepted: false
    },
    {
      name: 'that same language once the provider is not RapidAPI',
      over: {
        targets: [{ language: 'Catalan', fileToken: 'english' }],
        translate: translateConfig('openai')
      },
      accepted: true
    },
    {
      name: 'an unknown file token',
      over: { targets: [{ language: 'fr', fileToken: 'klingon' }] },
      accepted: false
    }
  ] as const

  it.each(cases)('$name', ({ over, accepted }) => {
    const input = { ...convertBase, ...over }
    expect(ScanModsInputSchema.safeParse(input).success, 'scan').toBe(accepted)
    expect(ConvertInputSchema.safeParse(input).success, 'convert').toBe(accepted)
  })

  it('ignores the provider limits while translation is off', () => {
    const input = {
      ...convertBase,
      targets: [{ language: 'Catalan', fileToken: 'english' }],
      translate: { ...translateConfig('rapidapi'), enabled: false }
    }
    expect(ScanModsInputSchema.safeParse(input).success).toBe(true)
    expect(ConvertInputSchema.safeParse(input).success).toBe(true)
  })
})
