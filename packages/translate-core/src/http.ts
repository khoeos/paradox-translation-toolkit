import type { FetchResponse } from './types.js'

/*
 * Ported from PR #4 (e21ee7a, `src/main/translate/providers.ts`) by Artem Kondrashev.
 */

/**
 * A request must end on its own timeout, but also the moment the user hits stop.
 * @param timeout - Per-request timeout in milliseconds
 * @param signal - The run-wide cancellation signal, when there is one
 * @returns The signal to hand to fetch
 */
export function withCancel(timeout: number, signal?: AbortSignal): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(timeout)
  return signal ? AbortSignal.any([timeoutSignal, signal]) : timeoutSignal
}

/** How much of an error body is worth keeping: enough to diagnose, not a whole HTML page. */
const MAX_ERROR_BODY = 200

/**
 * Read an error body without letting a huge HTML page into the logs.
 * @param response - The failed response
 * @returns A short message
 */
export async function describeFailure(response: FetchResponse): Promise<string> {
  const body = await response.text().catch(() => '')
  return `HTTP ${response.status} ${response.statusText} ${body.slice(0, MAX_ERROR_BODY)}`.trim()
}

/** Hosts a plain-http endpoint is allowed on, because the traffic never leaves the machine. */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0'])

export interface BaseUrlCheck {
  ok: boolean
  reason?: string
}

/**
 * Whether a base URL is safe to send an API key to.
 *
 * Audit finding S-13: the original accepted any URL with no validation, so an `http://` host
 * anywhere on the internet received the key as an `Authorization: Bearer` header in clear.
 * Aggravated by the CLI reading `ptt.config.json` from the current directory, which made a
 * downloaded folder able to exfiltrate `PTT_API_KEY`.
 * @param baseUrl - The configured endpoint
 * @param hasApiKey - Whether a key would be sent to it
 * @returns Whether the call may proceed, and why not when it may not
 */
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

/** Trailing slashes are a configuration accident, not a path segment. */
export function trimTrailingSlash(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '')
}
