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
  return baseUrl.replace(/\/+$/, '')
}
