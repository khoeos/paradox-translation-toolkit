export interface LocaleEntry {
  key: string
  version: number | null
  value: string
  comment?: string
  rawLine: number
  rawLineEnd?: number
}

export type BodyItem =
  | { kind: 'entry'; entry: LocaleEntry }
  | { kind: 'comment'; text: string }
  | { kind: 'blank' }

export interface LocaleFile {
  language: string
  entries: LocaleEntry[]
  trailingComments: string[]
  bom: boolean
  lineEnding?: '\n' | '\r\n'
  body?: BodyItem[]
}

export interface Diagnostic {
  line: number
  col: number
  severity: 'error' | 'warn'
  code: string
  message: string
}

export interface ParseResult {
  ok: boolean
  file: LocaleFile
  diagnostics: Diagnostic[]
}

export interface ParseOptions {
  strictBom?: boolean
}

export interface SerializeOptions {
  bom?: boolean
  lineEnding?: '\n' | '\r\n'
}

export interface ParsedFilename {
  base: string
  language: string
}
