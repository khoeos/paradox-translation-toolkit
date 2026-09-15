import { PROVIDER_DEFAULTS } from './defaults.js'
import { checkBaseUrl, describeFailure, trimTrailingSlash, withCancel } from './http.js'
import type { FetchLike, TranslateProvider } from './types.js'

export interface ModelListOptions {
  provider: TranslateProvider
  baseUrl: string
  timeout: number
  fetchFn: FetchLike
  apiKey?: string
  signal?: AbortSignal
}

const MAX_MODELS = 500

export async function getProviderModels(options: ModelListOptions): Promise<string[]> {
  const path = PROVIDER_DEFAULTS[options.provider].modelsPath
  if (path === undefined) return []

  const apiKey = options.apiKey ?? ''
  const check = checkBaseUrl(options.baseUrl, apiKey.length > 0)
  if (!check.ok) throw new Error(check.reason)

  const headers: Record<string, string> = {}
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`

  const response = await options.fetchFn(`${trimTrailingSlash(options.baseUrl)}${path}`, {
    method: 'GET',
    headers,
    signal: withCancel(options.timeout, options.signal)
  })

  if (!response.ok) throw new Error(await describeFailure(response))

  return readModelIds(await response.json())
}

export function readModelIds(data: unknown): string[] {
  const names = new Set<string>()
  for (const entry of readEntries(data)) {
    const name = readName(entry)
    if (name !== undefined) names.add(name)
  }
  return [...names].toSorted((a, b) => a.localeCompare(b)).slice(0, MAX_MODELS)
}

function readEntries(data: unknown): unknown[] {
  if (Array.isArray(data)) return data
  if (typeof data !== 'object' || data === null) return []
  if ('data' in data && Array.isArray(data.data)) return data.data
  if ('models' in data && Array.isArray(data.models)) return data.models
  return []
}

function readName(entry: unknown): string | undefined {
  if (typeof entry === 'string') return trimmed(entry)
  if (typeof entry !== 'object' || entry === null) return undefined
  if ('id' in entry && typeof entry.id === 'string') return trimmed(entry.id)
  if ('model' in entry && typeof entry.model === 'string') return trimmed(entry.model)
  if ('name' in entry && typeof entry.name === 'string') return trimmed(entry.name)
  return undefined
}

function trimmed(value: string): string | undefined {
  const name = value.trim()
  return name.length > 0 ? name : undefined
}
