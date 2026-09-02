export type FlagValue = string | boolean | number | undefined

export function asString(value: FlagValue): string | undefined {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  return undefined
}

export function asNumber(value: FlagValue, fallback: number): number {
  const parsed = Number(asString(value))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export function asBool(value: FlagValue, fallback = false): boolean {
  if (value === undefined) return fallback
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  return !/^(false|0|no)$/i.test(value)
}

export function asList(value: FlagValue): string[] | undefined {
  const text = asString(value)
  if (text === undefined) return undefined
  const items = text
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
  return items.length > 0 ? items : undefined
}
