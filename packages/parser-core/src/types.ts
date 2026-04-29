export interface LocaleEntry {
  key: string
  version: number | null
  value: string
  comment?: string
  rawLine: number
  /** End line of the entry; differs from rawLine for multi-line values. */
  rawLineEnd?: number
}

/** Ordered body items used by the serializer to round-trip source layout. */
export type BodyItem =
  | { kind: 'entry'; entry: LocaleEntry }
  | { kind: 'comment'; text: string }
  | { kind: 'blank' }

export interface LocaleFile {
  language: string
  entries: LocaleEntry[]
  trailingComments: string[]
  bom: boolean
  /** Detected line ending of the source. Default: '\n'. */
  lineEnding?: '\n' | '\r\n'
  /** Ordered body items when produced by the parser. */
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
