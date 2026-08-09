import type { LocaleEntry, LocaleFile, SerializeOptions } from './types.js'

const BOM = '﻿'
const ENTRY_INDENT = ' '

export function serialize(file: LocaleFile, opts?: SerializeOptions): string {
  const lineEnding = opts?.lineEnding ?? file.lineEnding ?? '\n'
  const includeBom = opts?.bom ?? file.bom

  const lines: string[] = []
  lines.push(`l_${file.language}:`)

  if (file.body && file.body.length > 0) {
    for (const item of file.body) {
      if (item.kind === 'entry') {
        lines.push(formatEntry(item.entry))
      } else if (item.kind === 'comment') {
        lines.push(item.text)
      } else {
        lines.push('')
      }
    }
  } else {
    // Layout used when the file was constructed in code rather than parsed.
    for (const entry of file.entries) {
      lines.push(formatEntry(entry))
    }
    for (const c of file.trailingComments) {
      lines.push(c)
    }
  }

  let output = lines.join(lineEnding) + lineEnding
  if (includeBom) {
    output = BOM + output
  }
  return output
}

/**
 * Quotes inside a value must stay escaped or the game stops reading the file.
 *
 * Unescape first, then escape: the parser keeps a value exactly as it sits on disk, so an
 * untouched value already carries `\"` and must not gain a second backslash, while a value
 * a caller just assigned carries a bare `"` and must gain one. Doing both makes the
 * function idempotent, which is what keeps the round-trip guarantee intact.
 *
 * Ported from PR #4 (e21ee7a, `src/main/translate/yml.ts` `escapeValue`) by Artem Kondrashev.
 */
function escapeValue(value: string): string {
  return value.replaceAll('\\"', '"').replaceAll('"', '\\"')
}

function formatEntry(entry: LocaleEntry): string {
  const versionStr = entry.version === null ? '' : String(entry.version)
  let line = `${ENTRY_INDENT}${entry.key}:${versionStr} "${escapeValue(entry.value)}"`
  if (entry.comment !== undefined) {
    line += ` ${entry.comment}`
  }
  return line
}
