import { describe, expect, it } from 'vitest'

import { LANGUAGE_CODES } from '@ptt/shared'

import {
  LANGUAGE_DISPLAY_NAMES,
  PROVIDER_DEFAULTS,
  RAPIDAPI_CODES,
  TRANSLATE_DEFAULTS,
  TRANSLATE_LIMITS,
  TRANSLATE_PROVIDERS,
  buildAnswerSchema,
  buildPrompt,
  indexed,
  isDefaultBaseUrl
} from '../src/index.js'

describe('TRANSLATE_DEFAULTS (Q-5)', () => {
  it('is the single set of defaults, so the UI and the CLI cannot drift', () => {
    expect(TRANSLATE_DEFAULTS.concurrency).toBe(2)
    expect(TRANSLATE_DEFAULTS.timeout).toBe(120_000)
    expect(TRANSLATE_DEFAULTS.model).toBe(PROVIDER_DEFAULTS.ollama.model)
    expect(TRANSLATE_DEFAULTS.baseUrl).toBe(PROVIDER_DEFAULTS.ollama.baseUrl)
  })

  it('starts disabled, so no run reaches a backend by accident', () => {
    expect(TRANSLATE_DEFAULTS.enabled).toBe(false)
  })

  it('sits inside its own limits', () => {
    expect(TRANSLATE_DEFAULTS.batchSize).toBeGreaterThanOrEqual(TRANSLATE_LIMITS.batchSize.min)
    expect(TRANSLATE_DEFAULTS.batchSize).toBeLessThanOrEqual(TRANSLATE_LIMITS.batchSize.max)
    expect(TRANSLATE_DEFAULTS.concurrency).toBeLessThanOrEqual(TRANSLATE_LIMITS.concurrency.max)
    expect(TRANSLATE_DEFAULTS.timeout).toBeGreaterThanOrEqual(TRANSLATE_LIMITS.timeout.min)
  })

  it('carries no apiKey, which is never persisted anywhere', () => {
    expect('apiKey' in TRANSLATE_DEFAULTS).toBe(false)
  })
})

describe('PROVIDER_DEFAULTS', () => {
  it('covers every provider', () => {
    for (const provider of TRANSLATE_PROVIDERS) {
      expect(PROVIDER_DEFAULTS[provider].baseUrl).not.toBe('')
    }
  })

  it('uses https for every remote provider', () => {
    expect(PROVIDER_DEFAULTS.openai.baseUrl.startsWith('https://')).toBe(true)
    expect(PROVIDER_DEFAULTS.rapidapi.baseUrl.startsWith('https://')).toBe(true)
    expect(PROVIDER_DEFAULTS.ollama.baseUrl.startsWith('http://localhost')).toBe(true)
  })

  it('marks which providers need a key and which pick their own model', () => {
    expect(PROVIDER_DEFAULTS.ollama.needsApiKey).toBe(false)
    expect(PROVIDER_DEFAULTS.openai.needsApiKey).toBe(true)
    expect(PROVIDER_DEFAULTS.rapidapi.fixedModel).toBe(true)
  })
})

describe('isDefaultBaseUrl', () => {
  it('recognises a URL the app put there', () => {
    expect(isDefaultBaseUrl(PROVIDER_DEFAULTS.openai.baseUrl)).toBe(true)
  })

  it('does not recognise one the user typed', () => {
    expect(isDefaultBaseUrl('https://my-own-gateway.internal/v1')).toBe(false)
  })
})

describe('language mappings', () => {
  it('names every registered language for the prompt', () => {
    for (const code of LANGUAGE_CODES) {
      expect(LANGUAGE_DISPLAY_NAMES[code], code).toBeTruthy()
    }
  })

  it('maps every registered language to a service code', () => {
    for (const code of LANGUAGE_CODES) {
      expect(RAPIDAPI_CODES[code], code).toBeTruthy()
    }
  })

  it('spells the language out rather than passing a code to a model', () => {
    expect(LANGUAGE_DISPLAY_NAMES['zh-Hans']).toBe('Simplified Chinese')
    expect(RAPIDAPI_CODES['zh-Hans']).toBe('zh')
  })
})

describe('buildAnswerSchema', () => {
  it('requires exactly one string per input index and forbids extra keys', () => {
    expect(buildAnswerSchema(3)).toEqual({
      type: 'object',
      properties: {
        translations: {
          type: 'object',
          properties: { '0': { type: 'string' }, '1': { type: 'string' }, '2': { type: 'string' } },
          required: ['0', '1', '2'],
          additionalProperties: false
        }
      },
      required: ['translations'],
      additionalProperties: false
    })
  })

  it('stays under the strict-mode property cap at the largest allowed batch', () => {
    const schema = buildAnswerSchema(TRANSLATE_LIMITS.batchSize.max)
    expect(schema.properties.translations.required).toHaveLength(TRANSLATE_LIMITS.batchSize.max)
    expect(TRANSLATE_LIMITS.batchSize.max).toBeLessThanOrEqual(5000)
  })
})

describe('buildPrompt', () => {
  it('names the target language', () => {
    expect(buildPrompt(['one'], 'Russian')).toContain('English to Russian')
  })

  it('states how many entries are expected', () => {
    expect(buildPrompt(['a', 'b', 'c'], 'French')).toContain('exactly 3 entries')
  })

  it('sends the batch index-keyed, so a reorder is harmless (S-4)', () => {
    const prompt = buildPrompt(['first', 'second'], 'French')
    expect(prompt).toContain('"0": "first"')
    expect(prompt).toContain('"1": "second"')
  })

  it('includes the game domain when there is one', () => {
    expect(buildPrompt(['one'], 'French', 'Stellaris, a space game')).toContain(
      'a mod for Stellaris, a space game'
    )
  })

  it('omits the domain block when there is none', () => {
    expect(buildPrompt(['one'], 'French')).not.toContain('belong to a mod for')
  })

  it('lists the glossary hints as source = target pairs', () => {
    const prompt = buildPrompt(['one'], 'Russian', undefined, [
      { source: 'men-at-arms', target: 'Профессионалы' }
    ])
    expect(prompt).toContain('men-at-arms = Профессионалы')
  })

  it('omits the hint block when there is none', () => {
    expect(buildPrompt(['one'], 'French', undefined, [])).not.toContain('base game already')
  })

  it('always spells out the markup rule', () => {
    expect(buildPrompt(['one'], 'French')).toContain('$VARIABLE$')
  })
})

describe('indexed', () => {
  it('keys each string by its position', () => {
    expect(indexed(['a', 'b'])).toEqual({ '0': 'a', '1': 'b' })
  })

  it('handles an empty batch', () => {
    expect(indexed([])).toEqual({})
  })
})
