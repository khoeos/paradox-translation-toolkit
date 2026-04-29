import type {
  BodyItem,
  Diagnostic,
  LocaleEntry,
  LocaleFile,
  ParseOptions,
  ParseResult
} from './types.js'

const BOM = '﻿'
const HEADER_RE = /^l_([a-z_]+):\s*$/i
const KEY_CHAR_RE = /[A-Za-z0-9_\-.]/
const DIGIT_RE = /[0-9]/

interface EntryParseSuccess {
  ok: true
  entry: LocaleEntry
  /** Number of additional lines consumed beyond `lineNum` (multi-line values). */
  consumedExtraLines: number
}

interface EntryParseFailure {
  ok: false
  diagnostic: Diagnostic
}

type EntryParseResult = EntryParseSuccess | EntryParseFailure

export function parse(source: string, opts?: ParseOptions): ParseResult {
  const diagnostics: Diagnostic[] = []
  let bom = false
  let text = source

  if (text.startsWith(BOM)) {
    bom = true
    text = text.slice(1)
  } else if (opts?.strictBom) {
    diagnostics.push({
      line: 1,
      col: 1,
      severity: 'warn',
      code: 'no-bom',
      message: 'Missing UTF-8 BOM (Paradox games require it)'
    })
  }

  const lineEnding: '\n' | '\r\n' = /\r\n/.test(text) ? '\r\n' : '\n'
  const lines = text.split(/\r?\n/)
  const entries: LocaleEntry[] = []
  const trailingComments: string[] = []
  const body: BodyItem[] = []
  let language = ''
  let foundHeader = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    const lineNum = i + 1
    const trimmed = line.trim()

    if (trimmed === '') {
      // Skip the EOF blank line produced by `split(/\r?\n/)`.
      if (foundHeader && i < lines.length - 1) {
        body.push({ kind: 'blank' })
      }
      continue
    }

    if (trimmed.startsWith('#')) {
      if (foundHeader) {
        trailingComments.push(trimmed)
        body.push({ kind: 'comment', text: trimmed })
      }
      continue
    }

    if (!foundHeader) {
      const headerMatch = HEADER_RE.exec(trimmed)
      if (headerMatch && headerMatch[1]) {
        language = headerMatch[1].toLowerCase()
        foundHeader = true
        continue
      }
      diagnostics.push({
        line: lineNum,
        col: 1,
        severity: 'error',
        code: 'no-header',
        message: 'Expected language header line (e.g. `l_english:`)'
      })
      continue
    }

    const result = parseEntryLines(lines, i, lineEnding)
    if (result.ok) {
      entries.push(result.entry)
      body.push({ kind: 'entry', entry: result.entry })
      i += result.consumedExtraLines
    } else {
      diagnostics.push(result.diagnostic)
    }
  }

  if (!foundHeader) {
    diagnostics.push({
      line: lines.length,
      col: 1,
      severity: 'error',
      code: 'missing-header',
      message: 'No `l_<language>:` header found in file'
    })
  }

  const ok = foundHeader && !diagnostics.some(d => d.severity === 'error')
  const file: LocaleFile = {
    language,
    entries,
    trailingComments,
    bom,
    lineEnding,
    body
  }
  return { ok, file, diagnostics }
}

/** Parses one entry, continuing across lines for unclosed quoted values. */
function parseEntryLines(
  lines: string[],
  startIdx: number,
  lineEnding: '\n' | '\r\n'
): EntryParseResult {
  const startLine = lines[startIdx] ?? ''
  const startLineNum = startIdx + 1
  let i = 0

  while (i < startLine.length && (startLine[i] === ' ' || startLine[i] === '\t')) i++

  const keyStart = i
  while (i < startLine.length) {
    const ch = startLine[i]
    if (ch === undefined || !KEY_CHAR_RE.test(ch)) break
    i++
  }
  if (i === keyStart) {
    return {
      ok: false,
      diagnostic: {
        line: startLineNum,
        col: i + 1,
        severity: 'error',
        code: 'expected-key',
        message: 'Expected key identifier'
      }
    }
  }
  const key = startLine.slice(keyStart, i)

  if (startLine[i] !== ':') {
    return {
      ok: false,
      diagnostic: {
        line: startLineNum,
        col: i + 1,
        severity: 'error',
        code: 'expected-colon',
        message: 'Expected `:` after key'
      }
    }
  }
  i++

  const versionStart = i
  while (i < startLine.length) {
    const ch = startLine[i]
    if (ch === undefined || !DIGIT_RE.test(ch)) break
    i++
  }
  const version = i > versionStart ? Number.parseInt(startLine.slice(versionStart, i), 10) : null

  while (i < startLine.length && (startLine[i] === ' ' || startLine[i] === '\t')) i++

  if (startLine[i] !== '"') {
    return {
      ok: false,
      diagnostic: {
        line: startLineNum,
        col: i + 1,
        severity: 'error',
        code: 'expected-quote',
        message: 'Expected `"` to start value'
      }
    }
  }
  i++

  // Consume until an unescaped closing `"`, preserving line endings.
  const valueParts: string[] = []
  let valueStart = i
  let lineIdx = startIdx
  let lineLen = startLine.length
  let currentLine = startLine
  let consumedExtraLines = 0
  let closed = false

  while (true) {
    if (i >= lineLen) {
      valueParts.push(currentLine.slice(valueStart))
      lineIdx++
      if (lineIdx >= lines.length) break
      consumedExtraLines++
      valueParts.push(lineEnding)
      currentLine = lines[lineIdx] ?? ''
      lineLen = currentLine.length
      i = 0
      valueStart = 0
      continue
    }
    const ch = currentLine[i]
    if (ch === '\\' && i + 1 < lineLen) {
      i += 2
      continue
    }
    if (ch === '"') {
      valueParts.push(currentLine.slice(valueStart, i))
      closed = true
      break
    }
    i++
  }

  if (!closed) {
    return {
      ok: false,
      diagnostic: {
        line: startLineNum,
        col: i + 1,
        severity: 'error',
        code: 'unterminated-string',
        message: 'Unterminated value string'
      }
    }
  }

  const value = valueParts.join('')
  const endLine = currentLine
  const endLineLen = endLine.length
  i++ // past the closing quote

  while (i < endLineLen && (endLine[i] === ' ' || endLine[i] === '\t')) i++

  const comment = endLine[i] === '#' ? endLine.slice(i) : undefined

  const entry: LocaleEntry = {
    key,
    version,
    value,
    rawLine: startLineNum,
    ...(consumedExtraLines > 0 && { rawLineEnd: startLineNum + consumedExtraLines }),
    ...(comment !== undefined && { comment })
  }
  return { ok: true, entry, consumedExtraLines }
}
