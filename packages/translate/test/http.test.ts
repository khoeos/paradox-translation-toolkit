import { describe, expect, it } from 'vitest'

import { checkBaseUrl, describeFailure, trimTrailingSlash, withCancel } from '../src/index.js'

describe('trimTrailingSlash', () => {
  it('drops trailing slashes', () => {
    expect(trimTrailingSlash('http://localhost:11434///')).toBe('http://localhost:11434')
  })

  it('leaves a clean URL alone', () => {
    expect(trimTrailingSlash('https://api.openai.com/v1')).toBe('https://api.openai.com/v1')
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
