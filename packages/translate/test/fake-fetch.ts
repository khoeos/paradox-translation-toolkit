import type { FetchInit, FetchLike, FetchResponse } from '../src/index.js'

export interface RecordedCall {
  url: string
  init: FetchInit
  body: unknown
}

export interface FakeFetch {
  fn: FetchLike
  calls: RecordedCall[]
}

export function fakeFetch(
  answer: (
    call: RecordedCall,
    index: number
  ) => Partial<FetchResponse> & { json?: () => Promise<unknown> }
): FakeFetch {
  const calls: RecordedCall[] = []
  const fn: FetchLike = async (url, init) => {
    const call: RecordedCall = { url, init, body: safeParse(init.body) }
    calls.push(call)
    const scripted = answer(call, calls.length - 1)
    return {
      ok: scripted.ok ?? true,
      status: scripted.status ?? 200,
      statusText: scripted.statusText ?? 'OK',
      text: scripted.text ?? (async () => ''),
      json: scripted.json ?? (async () => ({}))
    }
  }
  return { fn, calls }
}

export function openAiAnswering(translations: unknown): FakeFetch {
  return fakeFetch(() => ({
    json: async () => ({
      choices: [{ message: { content: JSON.stringify({ translations }) } }]
    })
  }))
}

export function ollamaAnswering(translations: unknown): FakeFetch {
  return fakeFetch(() => ({
    json: async () => ({ message: { content: JSON.stringify({ translations }) } })
  }))
}

function safeParse(body: string): unknown {
  try {
    return JSON.parse(body)
  } catch {
    return body
  }
}
