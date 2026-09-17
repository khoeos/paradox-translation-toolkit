import { describe, expect, it } from 'vitest'

import { HttpFailure } from '../src/http.js'
import {
  OllamaProvider,
  OpenAiProvider,
  RapidApiProvider,
  TRANSLATE_DEFAULTS,
  createProvider
} from '../src/index.js'
import { fakeFetch, ollamaAnswering, openAiAnswering } from './fake-fetch.js'

const TIMEOUT = 5_000

describe('OllamaProvider', () => {
  it('posts to /api/chat with the model and the prompt', async () => {
    const fetch = ollamaAnswering({ '0': 'un' })
    const provider = new OllamaProvider('http://localhost:11434', 'qwen2.5:7b', TIMEOUT, fetch.fn)
    expect(await provider.translate(['one'], 'French', 'English')).toEqual(['un'])

    const call = fetch.calls[0]!
    expect(call.url).toBe('http://localhost:11434/api/chat')
    expect(call.init.method).toBe('POST')
    expect(call.body).toMatchObject({ model: 'qwen2.5:7b', stream: false, think: false })
  })

  it('trims a trailing slash off the base URL', async () => {
    const fetch = ollamaAnswering({ '0': 'un' })
    const provider = new OllamaProvider('http://localhost:11434/', 'm', TIMEOUT, fetch.fn)
    await provider.translate(['one'], 'French', 'English')
    expect(fetch.calls[0]?.url).toBe('http://localhost:11434/api/chat')
  })

  it('passes the game domain into the prompt', async () => {
    const fetch = ollamaAnswering({ '0': 'un' })
    const provider = new OllamaProvider(
      'http://localhost:11434',
      'm',
      TIMEOUT,
      fetch.fn,
      'Crusader Kings III, a medieval dynasty game'
    )
    await provider.translate(['one'], 'French', 'English')
    expect(JSON.stringify(fetch.calls[0]?.body)).toContain('Crusader Kings III')
  })

  it('names the source language of the run in the prompt', async () => {
    const fetch = ollamaAnswering({ '0': 'un' })
    const provider = new OllamaProvider('http://localhost:11434', 'm', TIMEOUT, fetch.fn)
    await provider.translate(['one'], 'Catalan', 'Russian')
    const body = JSON.stringify(fetch.calls[0]?.body)
    expect(body).toContain('from Russian to Catalan')
    expect(body).not.toContain('from English')
  })

  it('passes the glossary hints into the prompt', async () => {
    const fetch = ollamaAnswering({ '0': 'un' })
    const provider = new OllamaProvider('http://localhost:11434', 'm', TIMEOUT, fetch.fn)
    await provider.translate(['men-at-arms'], 'Russian', 'English', [
      { source: 'men-at-arms', target: 'Профессионалы' }
    ])
    expect(JSON.stringify(fetch.calls[0]?.body)).toContain('Профессионалы')
  })

  it('throws with the status and body on a failure', async () => {
    const fetch = fakeFetch(() => ({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      text: async () => 'model "nope" not found'
    }))
    const provider = new OllamaProvider('http://localhost:11434', 'nope', TIMEOUT, fetch.fn)
    await expect(provider.translate(['one'], 'French', 'English')).rejects.toThrow(/404.*not found/)
  })

  it('throws when the answer carries no content', async () => {
    const fetch = fakeFetch(() => ({ json: async () => ({}) }))
    const provider = new OllamaProvider('http://localhost:11434', 'm', TIMEOUT, fetch.fn)
    await expect(provider.translate(['one'], 'French', 'English')).rejects.toThrow(/JSON/)
  })

  it('throws an HttpFailure of status 429 when rate limited', async () => {
    const fetch = fakeFetch(() => ({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests'
    }))
    const provider = new OllamaProvider('http://localhost:11434', 'm', TIMEOUT, fetch.fn)
    const translation = provider.translate(['one'], 'French', 'English')
    await expect(translation).rejects.toBeInstanceOf(HttpFailure)
    await expect(translation).rejects.toMatchObject({ status: 429 })
  })
})

describe('OpenAiProvider', () => {
  it('posts to /chat/completions with a bearer token', async () => {
    const fetch = openAiAnswering({ '0': 'un' })
    const provider = new OpenAiProvider(
      'https://api.openai.com/v1',
      'gpt-4o-mini',
      'sk-secret',
      TIMEOUT,
      fetch.fn
    )
    expect(await provider.translate(['one'], 'French', 'English')).toEqual(['un'])

    const call = fetch.calls[0]!
    expect(call.url).toBe('https://api.openai.com/v1/chat/completions')
    expect(call.init.headers.Authorization).toBe('Bearer sk-secret')
    expect(call.body).toMatchObject({
      response_format: { type: 'json_schema', json_schema: { name: 'translations', strict: true } }
    })
  })

  it('sends a strict json_schema with one required slot per input, never json_object', async () => {
    const fetch = openAiAnswering({ '0': 'un', '1': 'deux' })
    const provider = new OpenAiProvider('http://localhost:1234/v1', 'm', '', TIMEOUT, fetch.fn)
    await provider.translate(['one', 'two'], 'French', 'English')
    expect(fetch.calls[0]?.body).toMatchObject({
      response_format: {
        type: 'json_schema',
        json_schema: {
          schema: {
            required: ['translations'],
            properties: {
              translations: {
                required: ['0', '1'],
                properties: { '0': { type: 'string' }, '1': { type: 'string' } },
                additionalProperties: false
              }
            }
          }
        }
      }
    })
  })

  it('names the source language of the run in the prompt', async () => {
    const fetch = openAiAnswering({ '0': 'un' })
    const provider = new OpenAiProvider('http://localhost:1234/v1', 'm', '', TIMEOUT, fetch.fn)
    await provider.translate(['one'], 'Catalan', 'French')
    expect(JSON.stringify(fetch.calls[0]?.body)).toContain('from French to Catalan')
  })

  it('sends no Authorization header when there is no key', async () => {
    const fetch = openAiAnswering({ '0': 'un' })
    const provider = new OpenAiProvider('http://localhost:1234/v1', 'm', '', TIMEOUT, fetch.fn)
    await provider.translate(['one'], 'French', 'English')
    expect(fetch.calls[0]?.init.headers.Authorization).toBeUndefined()
  })

  it('refuses to send a key over plain http to a remote host (S-13)', async () => {
    const fetch = openAiAnswering({ '0': 'un' })
    const provider = new OpenAiProvider('http://evil.example.com/v1', 'm', 'sk', TIMEOUT, fetch.fn)
    await expect(provider.translate(['one'], 'French', 'English')).rejects.toThrow(/plain http/)
    expect(fetch.calls).toHaveLength(0)
  })

  it('maps a reordered answer by index (S-4)', async () => {
    const fetch = openAiAnswering({ '1': 'deux', '0': 'un' })
    const provider = new OpenAiProvider('http://localhost:1234/v1', 'm', '', TIMEOUT, fetch.fn)
    expect(await provider.translate(['one', 'two'], 'French', 'English')).toEqual(['un', 'deux'])
  })

  it('leaves a non-string slot undefined (S-5)', async () => {
    const fetch = openAiAnswering({ '0': 'un', '1': null })
    const provider = new OpenAiProvider('http://localhost:1234/v1', 'm', '', TIMEOUT, fetch.fn)
    expect(await provider.translate(['one', 'two'], 'French', 'English')).toEqual(['un', undefined])
  })

  it('throws an HttpFailure of status 429 when rate limited', async () => {
    const fetch = fakeFetch(() => ({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests'
    }))
    const provider = new OpenAiProvider('http://localhost:1234/v1', 'm', '', TIMEOUT, fetch.fn)
    const translation = provider.translate(['one'], 'French', 'English')
    await expect(translation).rejects.toBeInstanceOf(HttpFailure)
    await expect(translation).rejects.toMatchObject({ status: 429 })
  })
})

describe('RapidApiProvider', () => {
  it('masks markup before sending and restores it afterwards', async () => {
    const sent: unknown[] = []
    const fetch = fakeFetch(call => {
      sent.push(call.body)
      return { json: async () => ({ translated_json: { '0': 'Gagne {0} maintenant' } }) }
    })
    const provider = new RapidApiProvider('https://hub.example.com/t', 'key', TIMEOUT, fetch.fn)
    expect(await provider.translate(['Gain £energy£ now'], 'French', 'English')).toEqual([
      'Gagne £energy£ maintenant'
    ])
    expect(sent[0]).toMatchObject({ json_content: { '0': 'Gain {0} now' } })
  })

  it('sends the service language code, not the language name', async () => {
    const fetch = fakeFetch(() => ({ json: async () => ({ translated_json: { '0': 'x' } }) }))
    const provider = new RapidApiProvider('https://hub.example.com/t', 'key', TIMEOUT, fetch.fn)
    await provider.translate(['one'], 'Simplified Chinese', 'English')
    expect(fetch.calls[0]?.body).toMatchObject({ origin_language: 'en', target_language: 'zh' })
  })

  it('sends the source language of the run, not always en', async () => {
    const fetch = fakeFetch(() => ({ json: async () => ({ translated_json: { '0': 'x' } }) }))
    const provider = new RapidApiProvider('https://hub.example.com/t', 'key', TIMEOUT, fetch.fn)
    await provider.translate(['one'], 'Turkish', 'Brazilian Portuguese')
    expect(fetch.calls[0]?.body).toMatchObject({ origin_language: 'pt', target_language: 'tr' })
  })

  it('sends the key in the rapidapi headers', async () => {
    const fetch = fakeFetch(() => ({ json: async () => ({ translated_json: { '0': 'x' } }) }))
    const provider = new RapidApiProvider('https://hub.example.com/t', 'k', TIMEOUT, fetch.fn)
    await provider.translate(['one'], 'French', 'English')
    expect(fetch.calls[0]?.init.headers['x-rapidapi-key']).toBe('k')
    expect(fetch.calls[0]?.init.headers['x-rapidapi-host']).toBe('hub.example.com')
  })

  it('drops a string whose placeholders did not survive', async () => {
    const fetch = fakeFetch(() => ({
      json: async () => ({ translated_json: { '0': 'no token' } })
    }))
    const provider = new RapidApiProvider('https://hub.example.com/t', 'k', TIMEOUT, fetch.fn)
    expect(await provider.translate(['Gain $AMOUNT$'], 'French', 'English')).toEqual([undefined])
  })

  it('leaves a non-string answer undefined', async () => {
    const fetch = fakeFetch(() => ({ json: async () => ({ translated_json: { '0': 7 } }) }))
    const provider = new RapidApiProvider('https://hub.example.com/t', 'k', TIMEOUT, fetch.fn)
    expect(await provider.translate(['one'], 'French', 'English')).toEqual([undefined])
  })

  it('throws when translated_json is missing', async () => {
    const fetch = fakeFetch(() => ({ json: async () => ({ error: 'quota' }) }))
    const provider = new RapidApiProvider('https://hub.example.com/t', 'k', TIMEOUT, fetch.fn)
    await expect(provider.translate(['one'], 'French', 'English')).rejects.toThrow(
      /translated_json/
    )
  })

  it('sends the language of each call, not the one of the first call', async () => {
    const fetch = fakeFetch(() => ({ json: async () => ({ translated_json: { '0': 'x' } }) }))
    const provider = new RapidApiProvider('https://hub.example.com/t', 'k', TIMEOUT, fetch.fn)
    await provider.translate(['one'], 'German', 'English')
    await provider.translate(['one'], 'Turkish', 'English')
    expect(fetch.calls[0]?.body).toMatchObject({ target_language: 'de' })
    expect(fetch.calls[1]?.body).toMatchObject({ target_language: 'tr' })
  })

  it('refuses a free-text language instead of falling back to another one', async () => {
    const fetch = fakeFetch(() => ({ json: async () => ({ translated_json: { '0': 'x' } }) }))
    const provider = new RapidApiProvider('https://hub.example.com/t', 'k', TIMEOUT, fetch.fn)
    await expect(provider.translate(['one'], 'Catalan', 'English')).rejects.toThrow(
      /cannot translate into "Catalan"/
    )
    expect(fetch.calls).toHaveLength(0)
  })

  it('throws an HttpFailure of status 429 when rate limited', async () => {
    const fetch = fakeFetch(() => ({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests'
    }))
    const provider = new RapidApiProvider('https://hub.example.com/t', 'k', TIMEOUT, fetch.fn)
    const translation = provider.translate(['one'], 'French', 'English')
    await expect(translation).rejects.toBeInstanceOf(HttpFailure)
    await expect(translation).rejects.toMatchObject({ status: 429 })
  })
})

describe('createProvider', () => {
  const fetch = fakeFetch(() => ({ json: async () => ({}) }))

  it('builds each provider from the config', () => {
    expect(
      createProvider({ ...TRANSLATE_DEFAULTS, provider: 'ollama' }, 'fr', fetch.fn)
    ).toBeInstanceOf(OllamaProvider)
    expect(
      createProvider({ ...TRANSLATE_DEFAULTS, provider: 'openai' }, 'fr', fetch.fn)
    ).toBeInstanceOf(OpenAiProvider)
    expect(
      createProvider({ ...TRANSLATE_DEFAULTS, provider: 'rapidapi' }, 'fr', fetch.fn)
    ).toBeInstanceOf(RapidApiProvider)
  })

  it('refuses a free-text language for rapidapi, naming the languages it does support', () => {
    expect(() =>
      createProvider({ ...TRANSLATE_DEFAULTS, provider: 'rapidapi' }, 'Catalan', fetch.fn)
    ).toThrow(/RapidAPI provider cannot translate into "Catalan".*zh-Hans/s)
  })

  it('accepts a built-in code for rapidapi', () => {
    expect(
      createProvider({ ...TRANSLATE_DEFAULTS, provider: 'rapidapi' }, 'tr', fetch.fn)
    ).toBeInstanceOf(RapidApiProvider)
  })

  it('never refuses a free-text language for the model providers', () => {
    expect(
      createProvider({ ...TRANSLATE_DEFAULTS, provider: 'ollama' }, 'Catalan', fetch.fn)
    ).toBeInstanceOf(OllamaProvider)
    expect(
      createProvider({ ...TRANSLATE_DEFAULTS, provider: 'openai' }, 'Catalan', fetch.fn)
    ).toBeInstanceOf(OpenAiProvider)
  })

  it('hands the rapidapi provider the run source language', async () => {
    const answering = fakeFetch(() => ({ json: async () => ({ translated_json: { '0': 'x' } }) }))
    const provider = createProvider(
      { ...TRANSLATE_DEFAULTS, provider: 'rapidapi', apiKey: 'k' },
      'tr',
      answering.fn
    )
    await provider.translate(['one'], 'Turkish', 'French')
    expect(answering.calls[0]?.body).toMatchObject({ origin_language: 'fr' })
  })
})
