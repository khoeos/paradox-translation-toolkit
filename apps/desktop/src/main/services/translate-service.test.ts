import { describe, expect, it } from 'vitest'

import type { FetchLike } from '@ptt/shared'
import { PROBE_MARKUP, PROBE_PLAIN, type TranslateConfig } from '@ptt/translate'

import { TranslateService } from './translate-service.js'

const answering = (translations: Record<string, string>): FetchLike => () =>
  Promise.resolve({
    ok: true,
    status: 200,
    statusText: 'OK',
    text: () => Promise.resolve(''),
    json: () =>
      Promise.resolve({
        choices: [{ message: { content: JSON.stringify({ translations }) } }]
      })
  })

const config: TranslateConfig & { targetLanguage: 'fr' } = {
  enabled: true,
  provider: 'openai',
  baseUrl: 'http://localhost:1234/v1',
  model: 'local',
  batchSize: 20,
  concurrency: 1,
  retries: 1,
  timeout: 5000,
  targetLanguage: 'fr'
}

const test = (translations: Record<string, string>) =>
  new TranslateService('/data', answering(translations)).testProvider(config)

describe('testProvider', () => {
  it('probes a plain string and a string carrying markup', async () => {
    const result = await test({ 0: 'Vaisseau colonial', 1: 'Gagnez £gold£ et $VALUE$ prestige' })
    expect(result.ok).toBe(true)
    expect(result.translated).toBe('Vaisseau colonial')
    expect(result.markupSource).toBe(PROBE_MARKUP)
    expect(result.markupAnswer).toBe('Gagnez £gold£ et $VALUE$ prestige')
    expect(result.markupKept).toBe(true)
  })

  it('reports a backend that answers but drops a token', async () => {
    const result = await test({ 0: 'Vaisseau colonial', 1: 'Gagnez de l or et du prestige' })
    expect(result.ok).toBe(true)
    expect(result.markupKept).toBe(false)
    expect(result.markupAnswer).toBe('Gagnez de l or et du prestige')
  })

  it('reports a backend that translates a token instead of copying it', async () => {
    const result = await test({ 0: 'Vaisseau colonial', 1: 'Gagnez £or£ et $VALEUR$ prestige' })
    expect(result.markupKept).toBe(false)
  })

  it('accepts tokens that moved, since word order differs between languages', async () => {
    const result = await test({ 0: 'Vaisseau colonial', 1: '$VALUE$ prestige et £gold£ gagnés' })
    expect(result.markupKept).toBe(true)
  })

  it('reports a backend that duplicates a token', async () => {
    const result = await test({
      0: 'Vaisseau colonial',
      1: 'Gagnez £gold£ £gold£ et $VALUE$ prestige'
    })
    expect(result.markupKept).toBe(false)
  })


  it('fails when nothing usable comes back for the plain probe', async () => {
    const result = await test({ 1: 'Gagnez £gold£ et $VALUE$ prestige' })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('answered nothing')
  })

  it('says the markup was not kept when only the plain probe came back', async () => {
    const result = await test({ 0: 'Vaisseau colonial' })
    expect(result.ok).toBe(true)
    expect(result.markupKept).toBe(false)
    expect(result.markupAnswer).toBeUndefined()
  })

  it('sends both probes in one request', async () => {
    const sent: string[] = []
    const capture: FetchLike = (_url, init) => {
      sent.push(init.body ?? '')
      return answering({ 0: 'a', 1: 'b' })(_url, init)
    }
    await new TranslateService('/data', capture).testProvider(config)
    expect(sent[0]).toContain(PROBE_PLAIN)
    expect(sent[0]).toContain('$VALUE$')
  })
})
