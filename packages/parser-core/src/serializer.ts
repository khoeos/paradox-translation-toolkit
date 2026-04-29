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

function formatEntry(entry: LocaleEntry): string {
  const versionStr = entry.version === null ? '' : String(entry.version)
  let line = `${ENTRY_INDENT}${entry.key}:${versionStr} "${entry.value}"`
  if (entry.comment !== undefined) {
    line += ` ${entry.comment}`
  }
  return line
}
