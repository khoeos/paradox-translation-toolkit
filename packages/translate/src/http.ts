/// <reference lib="dom" />

import type { FetchResponse } from './types.js'

export function withCancel(timeout: number, signal?: AbortSignal): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(timeout)
  return signal ? AbortSignal.any([timeoutSignal, signal]) : timeoutSignal
}

const MAX_ERROR_BODY = 200

export async function describeFailure(response: FetchResponse): Promise<string> {
  const body = await response.text().catch(() => '')
  return `HTTP ${response.status} ${response.statusText} ${body.slice(0, MAX_ERROR_BODY)}`.trim()
}

const MS_PER_SECOND = 1000

const DELAY_SECONDS_PATTERN = /^\d+$/

const HTTP_DATE_LETTERS = /[a-z]/i

export class HttpFailure extends Error {
  readonly status: number
  readonly retryAfterMs?: number

  constructor(message: string, status: number, retryAfterMs?: number) {
    super(message)
    this.name = 'HttpFailure'
    this.status = status
    if (retryAfterMs !== undefined) this.retryAfterMs = retryAfterMs
  }
}

export async function httpFailure(response: FetchResponse): Promise<HttpFailure> {
  const message = await describeFailure(response)
  const retryAfterMs = parseRetryAfterMs(response.headers)
  return retryAfterMs === undefined
    ? new HttpFailure(message, response.status)
    : new HttpFailure(message, response.status, retryAfterMs)
}

function parseRetryAfterMs(headers: FetchResponse['headers']): number | undefined {
  if (!headers) return undefined
  const value = headers.get('Retry-After')
  if (value === null) return undefined

  const trimmed = value.trim()
  if (trimmed.length === 0) return undefined
  if (DELAY_SECONDS_PATTERN.test(trimmed)) return Number(trimmed) * MS_PER_SECOND
  if (!HTTP_DATE_LETTERS.test(trimmed)) return undefined

  const date = Date.parse(trimmed)
  if (Number.isNaN(date)) return undefined
  return Math.max(0, date - Date.now())
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0'])

export interface BaseUrlCheck {
  ok: boolean
  reason?: string
}

export function checkBaseUrl(baseUrl: string, hasApiKey: boolean): BaseUrlCheck {
  let url: URL
  try {
    url = new URL(baseUrl)
  } catch {
    return { ok: false, reason: `Not a valid URL: ${baseUrl}` }
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: `Unsupported scheme "${url.protocol}", use http or https` }
  }
  if (url.protocol === 'http:' && hasApiKey && !LOCAL_HOSTS.has(url.hostname)) {
    return {
      ok: false,
      reason: `Refusing to send an API key over plain http to ${url.hostname}, use https`
    }
  }
  return { ok: true }
}

export function trimTrailingSlash(baseUrl: string): string {
  let end = baseUrl.length
  while (end > 0 && baseUrl[end - 1] === '/') end--
  return baseUrl.slice(0, end)
}
