import { describe, expect, it } from 'vitest'

import { HttpFailure, httpFailure } from '../src/http.js'
import { checkBaseUrl, describeFailure, trimTrailingSlash, withCancel } from '../src/index.js'

describe('trimTrailingSlash', () => {
  it('drops trailing slashes', () => {
    expect(trimTrailingSlash('http://localhost:11434///')).toBe('http://localhost:11434')
  })

  it('leaves a clean URL alone', () => {
    expect(trimTrailingSlash('https://api.openai.com/v1')).toBe('https://api.openai.com/v1')
  })

  it('empties a string made of slashes only', () => {
    expect(trimTrailingSlash('///')).toBe('')
    expect(trimTrailingSlash('')).toBe('')
  })

  it('stays linear on a long run of inner slashes', () => {
    const url = `${'/'.repeat(50_000)}a/`
    const start = Date.now()
    expect(trimTrailingSlash(url)).toBe(`${'/'.repeat(50_000)}a`)
    expect(Date.now() - start).toBeLessThan(500)
  })
})

describe('withCancel', () => {
  it('returns a signal that is not yet aborted', () => {
    expect(withCancel(1000).aborted).toBe(false)
  })

  it('is already aborted when the run-wide signal is', () => {
    const controller = new AbortController()
    controller.abort()
    expect(withCancel(1000, controller.signal).aborted).toBe(true)
  })

  it('aborts when the run-wide signal fires later', () => {
    const controller = new AbortController()
    const signal = withCancel(60_000, controller.signal)
    expect(signal.aborted).toBe(false)
    controller.abort()
    expect(signal.aborted).toBe(true)
  })

  it('aborts on a timeout of zero', async () => {
    const signal = withCancel(0)
    await new Promise(resolve => {
      signal.addEventListener('abort', resolve, { once: true })
    })
    expect(signal.aborted).toBe(true)
  })
})

const response = (over: Record<string, unknown>): Parameters<typeof describeFailure>[0] => ({
  ok: false,
  status: 500,
  statusText: 'Internal Server Error',
  text: async () => '',
  json: async () => ({}),
  ...over
})

describe('describeFailure', () => {
  it('names the status and the body', async () => {
    const message = await describeFailure(response({ text: async () => 'model not found' }))
    expect(message).toBe('HTTP 500 Internal Server Error model not found')
  })

  it('truncates a huge body so a whole HTML page stays out of the logs', async () => {
    const message = await describeFailure(response({ text: async () => 'x'.repeat(5000) }))
    expect(message.length).toBeLessThan(300)
  })

  it('survives a body that cannot be read', async () => {
    const message = await describeFailure(
      response({
        text: async () => {
          throw new Error('stream closed')
        }
      })
    )
    expect(message).toContain('HTTP 500')
  })
})

describe('checkBaseUrl (S-13)', () => {
  it('accepts https anywhere', () => {
    expect(checkBaseUrl('https://api.openai.com/v1', true).ok).toBe(true)
  })

  it('accepts plain http on localhost, which never leaves the machine', () => {
    expect(checkBaseUrl('http://localhost:11434', true).ok).toBe(true)
    expect(checkBaseUrl('http://127.0.0.1:1234', true).ok).toBe(true)
  })

  it('accepts plain http anywhere when no key would be sent', () => {
    expect(checkBaseUrl('http://192.168.1.10:11434', false).ok).toBe(true)
  })

  it('refuses to send a key over plain http to a remote host', () => {
    const check = checkBaseUrl('http://evil.example.com/v1', true)
    expect(check.ok).toBe(false)
    expect(check.reason).toContain('evil.example.com')
  })

  it('refuses a non-http scheme', () => {
    expect(checkBaseUrl('file:///etc/passwd', false).ok).toBe(false)
    expect(checkBaseUrl('ftp://example.com', false).ok).toBe(false)
  })

  it('refuses something that is not a URL', () => {
    const check = checkBaseUrl('not a url', false)
    expect(check.ok).toBe(false)
    expect(check.reason).toContain('Not a valid URL')
  })
})

const headersOf = (value: string | null): { get(name: string): string | null } => ({
  get: () => value
})

describe('httpFailure', () => {
  it('carries the status', async () => {
    const failure = await httpFailure(response({ status: 429, statusText: 'Too Many Requests' }))
    expect(failure).toBeInstanceOf(HttpFailure)
    expect(failure.status).toBe(429)
  })

  it('reuses describeFailure for its message, unchanged', async () => {
    const same = response({ text: async () => 'quota exceeded' })
    const failure = await httpFailure(same)
    expect(failure.message).toBe(await describeFailure(same))
  })

  it('reads Retry-After as seconds', async () => {
    const failure = await httpFailure(response({ headers: headersOf('2') }))
    expect(failure.retryAfterMs).toBe(2000)
  })

  it('reads Retry-After as an HTTP date', async () => {
    const future = new Date(Date.now() + 5000).toUTCString()
    const failure = await httpFailure(response({ headers: headersOf(future) }))
    expect(failure.retryAfterMs).toBeGreaterThan(0)
    expect(failure.retryAfterMs).toBeLessThanOrEqual(5000)
  })

  it('ignores an unreadable Retry-After value', async () => {
    const failure = await httpFailure(response({ headers: headersOf('not a date') }))
    expect(failure.retryAfterMs).toBeUndefined()
  })

  it('ignores an empty Retry-After rather than reading it as zero', async () => {
    const failure = await httpFailure(response({ headers: headersOf('') }))
    expect(failure.retryAfterMs).toBeUndefined()
  })

  it('ignores a blank Retry-After rather than reading it as zero', async () => {
    const failure = await httpFailure(response({ headers: headersOf('   ') }))
    expect(failure.retryAfterMs).toBeUndefined()
  })

  it('ignores a negative Retry-After rather than reading it as zero', async () => {
    const failure = await httpFailure(response({ headers: headersOf('-30') }))
    expect(failure.retryAfterMs).toBeUndefined()
  })

  it('ignores a fractional Retry-After, which the grammar does not allow', async () => {
    const failure = await httpFailure(response({ headers: headersOf('1.5') }))
    expect(failure.retryAfterMs).toBeUndefined()
  })

  it('reads an explicit zero Retry-After as zero', async () => {
    const failure = await httpFailure(response({ headers: headersOf('0') }))
    expect(failure.retryAfterMs).toBe(0)
  })

  it('reads a padded Retry-After as seconds', async () => {
    const failure = await httpFailure(response({ headers: headersOf(' 3 ') }))
    expect(failure.retryAfterMs).toBe(3000)
  })

  it('reads a past HTTP date as zero', async () => {
    const past = new Date(Date.now() - 60_000).toUTCString()
    const failure = await httpFailure(response({ headers: headersOf(past) }))
    expect(failure.retryAfterMs).toBe(0)
  })

  it('leaves retryAfterMs undefined when there is no header', async () => {
    const failure = await httpFailure(response({ headers: headersOf(null) }))
    expect(failure.retryAfterMs).toBeUndefined()
  })

  it('leaves retryAfterMs undefined when the response has no headers', async () => {
    const failure = await httpFailure(response({}))
    expect(failure.retryAfterMs).toBeUndefined()
  })
})
