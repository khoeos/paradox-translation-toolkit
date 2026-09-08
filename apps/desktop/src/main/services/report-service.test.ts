import { describe, expect, it, vi } from 'vitest'

import type { FetchLike } from '@ptt/shared'

import { ReportService, type ReportInput } from './report-service.js'

const okResponse = {
  ok: true,
  status: 204,
  statusText: 'No Content',
  text: async () => '',
  json: async () => ({})
}

const baseInput: ReportInput = {
  message: 'Something broke',
  page: '/ (game: stellaris)',
  settings: 'Mode: add-to-current'
}

const makeService = (fetchFn: FetchLike, webhookUrl = 'https://discord.test/webhook'): ReportService =>
  new ReportService(webhookUrl, '1.2.3', 'darwin arm64', fetchFn)

const parseEmbed = (fetchFn: ReturnType<typeof vi.fn>): Record<string, unknown> => {
  const [, init] = fetchFn.mock.calls[0]!
  const payload = JSON.parse(init.body)
  return payload.embeds[0]
}

describe('ReportService', () => {
  it('is disabled and refuses to send without a webhook url', async () => {
    const fetchFn = vi.fn<FetchLike>()
    const service = makeService(fetchFn, '')
    expect(service.isEnabled()).toBe(false)
    await expect(service.sendReport(baseInput)).rejects.toThrow(/not configured/)
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('posts a Discord embed with version, OS, page and settings', async () => {
    const fetchFn = vi.fn<FetchLike>(async () => okResponse)
    const service = makeService(fetchFn)

    await service.sendReport(baseInput)

    expect(fetchFn).toHaveBeenCalledTimes(1)
    const [url, init] = fetchFn.mock.calls[0]!
    expect(url).toBe('https://discord.test/webhook')
    expect(init.method).toBe('POST')
    expect(init.headers['Content-Type']).toBe('application/json')

    const embed = parseEmbed(fetchFn)
    expect(embed.description).toBe('Something broke')
    const fields = embed.fields as { name: string; value: string }[]
    const names = fields.map(f => f.name)
    expect(names).toEqual(['Version', 'OS', 'Page', 'Settings'])
    expect(fields.find(f => f.name === 'Version')?.value).toBe('1.2.3')
    expect(fields.find(f => f.name === 'Page')?.value).toBe('/ (game: stellaris)')
  })

  it('omits contact and technical fields when not provided', async () => {
    const fetchFn = vi.fn<FetchLike>(async () => okResponse)
    await makeService(fetchFn).sendReport(baseInput)
    const fields = parseEmbed(fetchFn).fields as { name: string }[]
    const names = fields.map(f => f.name)
    expect(names).not.toContain('Contact')
    expect(names).not.toContain('Paths')
    expect(names).not.toContain('Recent jobs')
  })

  it('includes contact, paths and jobs when provided', async () => {
    const fetchFn = vi.fn<FetchLike>(async () => okResponse)
    await makeService(fetchFn).sendReport({
      ...baseInput,
      contact: 'me@example.com',
      technical: { paths: 'Mod folders: stellaris=/tmp/mods', jobs: ['done - 3/3 mods'] }
    })
    const fields = parseEmbed(fetchFn).fields as { name: string; value: string }[]
    expect(fields.find(f => f.name === 'Contact')?.value).toBe('me@example.com')
    expect(fields.find(f => f.name === 'Paths')?.value).toContain('/tmp/mods')
    expect(fields.find(f => f.name === 'Recent jobs')?.value).toBe('done - 3/3 mods')
  })

  it('truncates a message longer than the Discord description limit', async () => {
    const fetchFn = vi.fn<FetchLike>(async () => okResponse)
    await makeService(fetchFn).sendReport({ ...baseInput, message: 'x'.repeat(5000) })
    const description = parseEmbed(fetchFn).description as string
    expect(description.length).toBe(4096)
    expect(description.endsWith('…')).toBe(true)
  })

  it('throws when the endpoint rejects the request', async () => {
    const fetchFn = vi.fn<FetchLike>(async () => ({
      ...okResponse,
      ok: false,
      status: 400,
      statusText: 'Bad Request'
    }))
    await expect(makeService(fetchFn).sendReport(baseInput)).rejects.toThrow(/400/)
  })
})
