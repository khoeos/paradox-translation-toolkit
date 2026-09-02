import type {
  BodyItem,
  Diagnostic,
  LocaleEntry,
  LocaleFile,
  ParseOptions,
  ParseResult
} from './types.js'

const BOM = '﻿'
const HEADER_RE = /^l_([a-z_]+)\s*:\s*(?:\d+\s*)?(?:#.*)?$/i

const SPACE_CHARS = ' \t\u00A0\u200B\uFEFF\u3000'
const SPACE = `[${SPACE_CHARS}]`
const KEY_EDGE = `[^:"#\r\n${SPACE_CHARS}]`
const KEY = `${KEY_EDGE}(?:[^:"#\r\n]*${KEY_EDGE})?`
const VERSION = `(?:(\\d+)${SPACE}*)?`

const ENTRY_HEAD_RE = new RegExp(`^${SPACE}*(${KEY})${SPACE}*:${SPACE}*${VERSION}"`)
const ENTRY_HEAD_NO_QUOTE_RE = new RegExp(`^${SPACE}*(${KEY})${SPACE}*:${SPACE}*${VERSION}`)
const INDENT_RE = new RegExp(`^${SPACE}*`)

interface EntryParseSuccess {
  ok: true
  entry: LocaleEntry
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
  let headerErrorReported = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    const lineNum = i + 1
    const trimmed = line.trim()

    if (trimmed === '') {
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
      if (!headerErrorReported) {
        headerErrorReported = true
        diagnostics.push({
          line: lineNum,
          col: 1,
          severity: 'error',
          code: 'no-header',
          message:
            'Content before the `l_<language>:` header, skipped (the game reads nothing above it)'
        })
      }
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
      message: 'No `l_<language>:` header in the file, so none of its keys can be read'
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

const headDiagnostic = (line: string, lineNum: number): Diagnostic => {
  const indent = INDENT_RE.exec(line)?.[0].length ?? 0
  const rest = line.slice(indent)
  if (rest === '' || rest.startsWith(':')) {
    return {
      line: lineNum,
      col: indent + 1,
      severity: 'error',
      code: 'expected-key',
      message: 'No key before the `:`, line skipped (the game skips it too)'
    }
  }
  const upToValue = ENTRY_HEAD_NO_QUOTE_RE.exec(line)
  if (upToValue === null) {
    return {
      line: lineNum,
      col: indent + 1,
      severity: 'error',
      code: 'expected-colon',
      message: 'Dangling line: no `:` and no value, line skipped (the game skips it too)'
    }
  }
  return {
    line: lineNum,
    col: upToValue[0].length + 1,
    severity: 'error',
    code: 'expected-quote',
    message: 'Key with no quoted value, line skipped (the game skips it too)'
  }
}

const getEntryHeadKeyAt = (line: string, quoteIdx: number): string | null => {
  const head = ENTRY_HEAD_RE.exec(line)
  if (head === null || head[0].length !== quoteIdx + 1) return null
  const key = head[1] ?? ''
  return key === '' ? null : key
}

function parseEntryLines(
  lines: string[],
  startIdx: number,
  lineEnding: '\n' | '\r\n'
): EntryParseResult {
  const startLine = lines[startIdx] ?? ''
  const startLineNum = startIdx + 1

  const head = ENTRY_HEAD_RE.exec(startLine)
  const key = head === null ? '' : (head[1] ?? '')
  if (head === null || key === '') {
    return { ok: false, diagnostic: headDiagnostic(startLine, startLineNum) }
  }
  const versionDigits = head[2] ?? ''
  const version = versionDigits === '' ? null : Number.parseInt(versionDigits, 10)
  let i = head[0].length

  const valueParts: string[] = []
  let valueStart = i
  let lineIdx = startIdx
  let lineLen = startLine.length
  let currentLine = startLine
  let consumedExtraLines = 0
  let closed = false
  let nextEntry: { key: string; lineNum: number } | null = null

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
      if (lineIdx > startIdx) {
        const headKey = getEntryHeadKeyAt(currentLine, i)
        if (headKey !== null) {
          nextEntry = { key: headKey, lineNum: lineIdx + 1 }
          break
        }
      }
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
        col: nextEntry === null ? i + 1 : head[0].length,
        severity: 'error',
        code: 'unterminated-string',
        message:
          nextEntry === null
            ? 'Value string never closed before the end of the file, line skipped'
            : `Value string never closed before the next key \`${nextEntry.key}\` (line ${nextEntry.lineNum}), line skipped`
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
