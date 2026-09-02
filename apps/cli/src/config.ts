import { readFileSync } from 'node:fs'

import type { FlagValue } from './coerce.js'

export const DEFAULT_CONFIG_FILE = 'ptt.config.json'

export type ConfigFlags = Record<string, FlagValue>

export function readConfig(file?: string): ConfigFlags {
  const target = file ?? DEFAULT_CONFIG_FILE
  let raw: string
  try {
    raw = readFileSync(target, 'utf8')
  } catch (err) {
    if (file) throw new Error(`Cannot read ${target}: ${message(err)}`, { cause: err })
    return {}
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    throw new Error(`${target} is not valid JSON: ${message(err)}`, { cause: err })
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${target} must hold a JSON object of flags`)
  }

  const flags: ConfigFlags = {}
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') {
      flags[key] = value
      continue
    }
    throw new Error(`${target}: "${key}" must be a string, a number or a boolean`)
  }
  return flags
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
