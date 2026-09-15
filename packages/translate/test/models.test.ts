import { describe, expect, it } from 'vitest'

import { getProviderModels, hasModelList, readModelIds } from '../src/index.js'
import { fakeFetch } from './fake-fetch.js'

const TIMEOUT = 5_000

describe('hasModelList', () => {
  it('is true for the two providers that expose a catalogue', () => {
    expect(hasModelList('ollama')).toBe(true)
    expect(hasModelList('openai')).toBe(true)
  })

  it('is false for the provider that picks its own model', () => {
    expect(hasModelList('rapidapi')).toBe(false)
  })
})

describe('readModelIds', () => {
  it('reads the OpenAI shape', () => {
    expect(readModelIds({ data: [{ id: 'gpt-4o-mini' }, { id: 'gpt-4o' }] })).toEqual([
      'gpt-4o',
      'gpt-4o-mini'
    ])
  })

  it('reads the Ollama shape', () => {
    expect(readModelIds({ models: [{ name: 'qwen2.5:7b' }, { name: 'mistral:latest' }] })).toEqual([
      'mistral:latest',
      'qwen2.5:7b'
    ])
  })

  it('reads a bare array and plain strings', () => {
    expect(readModelIds([{ id: 'a' }, 'b'])).toEqual(['a', 'b'])
  })

  it('drops duplicates, blanks and entries with no usable name', () => {
    expect(
      readModelIds({ data: [{ id: 'a' }, { id: 'a' }, { id: '  ' }, { foo: 1 }, null] })
    ).toEqual(['a'])
  })

  it('returns nothing rather than throwing on an unexpected payload', () => {
    expect(readModelIds({ error: 'nope' })).toEqual([])
    expect(readModelIds(null)).toEqual([])
    expect(readModelIds('models')).toEqual([])
  })
})

describe('getProviderModels', () => {
  it('gets the OpenAI-compatible catalogue from /models', async () => {
    const fetch = fakeFetch(() => ({ json: async () => ({ data: [{ id: 'local-model' }] }) }))
    const models = await getProviderModels({
      provider: 'openai',
      baseUrl: 'http://localhost:1234/v1',
      timeout: TIMEOUT,
      fetchFn: fetch.fn
    })

    expect(models).toEqual(['local-model'])
    const call = fetch.calls[0]!
    expect(call.url).toBe('http://localhost:1234/v1/models')
    expect(call.init.method).toBe('GET')
    expect(call.init.body).toBeUndefined()
  })

  it('gets the Ollama catalogue from /api/tags', async () => {
    const fetch = fakeFetch(() => ({ json: async () => ({ models: [{ name: 'qwen2.5:7b' }] }) }))
    const models = await getProviderModels({
      provider: 'ollama',
      baseUrl: 'http://localhost:11434/',
      timeout: TIMEOUT,
      fetchFn: fetch.fn
    })

    expect(models).toEqual(['qwen2.5:7b'])
    expect(fetch.calls[0]?.url).toBe('http://localhost:11434/api/tags')
  })

  it('sends the API key as a bearer token when there is one', async () => {
    const fetch = fakeFetch(() => ({ json: async () => ({ data: [] }) }))
    await getProviderModels({
      provider: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      timeout: TIMEOUT,
      fetchFn: fetch.fn,
      apiKey: 'sk-test'
    })

    expect(fetch.calls[0]?.init.headers).toMatchObject({ Authorization: 'Bearer sk-test' })
  })

  it('never reaches the network for a provider with a fixed model', async () => {
    const fetch = fakeFetch(() => ({ json: async () => ({ data: [{ id: 'x' }] }) }))
    expect(
      await getProviderModels({
        provider: 'rapidapi',
        baseUrl: 'https://ai-translate.p.rapidapi.com/translates_json',
        timeout: TIMEOUT,
        fetchFn: fetch.fn
      })
    ).toEqual([])
    expect(fetch.calls).toHaveLength(0)
  })

  it('refuses to send a key over plain http to a remote host', async () => {
    const fetch = fakeFetch(() => ({ json: async () => ({ data: [] }) }))
    await expect(
      getProviderModels({
        provider: 'openai',
        baseUrl: 'http://example.com/v1',
        timeout: TIMEOUT,
        fetchFn: fetch.fn,
        apiKey: 'sk-test'
      })
    ).rejects.toThrow(/https/)
    expect(fetch.calls).toHaveLength(0)
  })

  it('throws with the status and the body on a failure', async () => {
    const fetch = fakeFetch(() => ({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      text: async () => 'no route'
    }))
    await expect(
      getProviderModels({
        provider: 'openai',
        baseUrl: 'http://localhost:1234/v1',
        timeout: TIMEOUT,
        fetchFn: fetch.fn
      })
    ).rejects.toThrow('HTTP 404 Not Found no route')
  })
})
