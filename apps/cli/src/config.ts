import { readFileSync } from 'node:fs'

import type { FlagValue } from './coerce.js'

/**
 * The config file holding the flags that never change between runs.
 *
 * Ported from PR #4 (e21ee7a, `src/cli/options.ts` `readConfig`) by Artem Kondrashev. Read from the
 * current directory, which is convenient and is also audit finding S-14: running the CLI inside a
 * downloaded folder lets a config found there redirect the backend. The `--api-key` value never
 * comes from here, only from the flag or `PTT_API_KEY`, and `checkBaseUrl` refuses to send a key
 * over plain http to a remote host, which is what makes that reachable-but-not-exploitable.
 */

export const DEFAULT_CONFIG_FILE = 'ptt.config.json'

export type ConfigFlags = Record<string, FlagValue>

/**
 * Read the stored flags.
 * @param file - The config path, or undefined to look for the default one
 * @returns The stored flags, empty when there is no config
 * @throws When an explicit `--config` cannot be read or parsed
 */
export function readConfig(file?: string): ConfigFlags {
  const target = file ?? DEFAULT_CONFIG_FILE
  let raw: string
  try {
    raw = readFileSync(target, 'utf8')
  } catch (err) {
    // An explicit --config that cannot be read is a mistake worth stopping for; a missing
    // default one just means there is no config.
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
    // Anything else could not have come from a flag, so it is a typo worth naming.
    throw new Error(`${target}: "${key}" must be a string, a number or a boolean`)
  }
  return flags
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
