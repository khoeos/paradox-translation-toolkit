import type { FsLike, KeyReport } from '@ptt/converter-core'
import { posixDirname } from '@ptt/converter-core'

/*
 * Ported from PR #4 (e21ee7a, `src/main/report/index.ts`) by Artem Kondrashev.
 */

/** Rows written to the CSV: a full collection can refuse far more than a spreadsheet holds. */
export const MAX_CSV_ROWS = 200_000

/** Excel reads a UTF-8 CSV as mojibake unless the file opens with a byte order mark. */
export const BOM = '﻿'

/**
 * Characters that make a spreadsheet read a cell as a formula rather than as text.
 *
 * Audit finding S-2: the source, key and mod name columns come from the YML and descriptor
 * content of third-party mods, so a booby-trapped mod could have a formula evaluated the moment
 * the report was opened. Prefixing with an apostrophe is the documented Excel and LibreOffice
 * way of forcing a cell to be text.
 */
const FORMULA_PREFIXES = new Set(['=', '+', '-', '@', '\t', '\r'])

export type CsvValue = string | number | undefined

/**
 * A key report as the CSV writer needs it: read-only, and tolerant of the `T | undefined` shape zod
 * infers for an optional field, which `exactOptionalPropertyTypes` will not assign to `field?: T`.
 * Nothing here writes to a row, so widening costs nothing.
 */
export interface KeyReportLike extends Omit<
  KeyReport,
  'provider' | 'reason' | 'markupOnly' | 'shadowed'
> {
  provider?: string | undefined
  reason?: string | undefined
  markupOnly?: boolean | undefined
  shadowed?: boolean | undefined
}

/**
 * Quote one CSV field.
 * @param value - The raw field
 * @returns The field, quoted when it has to be and never evaluated as a formula
 */
export function csvField(value: CsvValue): string {
  const text = String(value ?? '')
  const neutralised = FORMULA_PREFIXES.has(text.charAt(0))
  const safe = neutralised ? `'${text}` : text
  // A neutralised field is always quoted too: a bare leading apostrophe is honoured as a text
  // marker by some spreadsheets and shown literally by others, and quoting settles it.
  const mustQuote = neutralised || /[",\n\r\t]/.test(safe)
  return mustQuote ? `"${safe.replaceAll('"', '""')}"` : safe
}

/**
 * Build a CSV document.
 * @param header - The column names
 * @param rows - The rows, already in column order
 * @returns The CSV content, with the BOM Excel needs to read UTF-8
 */
export function toCsv(header: readonly string[], rows: ReadonlyArray<readonly CsvValue[]>): string {
  const lines = [header, ...rows].map(row => row.map(csvField).join(','))
  return `${BOM}${lines.join('\r\n')}\r\n`
}

/** Columns of the key-level CSV, shared by the run report and the CLI audit. */
export const KEY_COLUMNS = [
  'mod',
  'modId',
  'language',
  'key',
  'state',
  'reason',
  'markupOnly',
  'shadowed',
  'source',
  'provider',
  'file'
] as const

/** One key report as a CSV row, in `KEY_COLUMNS` order. */
export function keyRow(key: KeyReportLike): CsvValue[] {
  return [
    key.modName,
    key.modId,
    key.language,
    key.key,
    key.state,
    key.reason,
    key.markupOnly ? 'yes' : '',
    key.shadowed ? 'yes' : '',
    key.source,
    key.provider,
    key.file
  ]
}

export interface KeyCsvResult {
  /** Rows actually written. */
  rows: number
  /** Rows left out because the cap was reached, so the file can say it is partial. */
  dropped: number
}

/**
 * Write a key-level CSV.
 * @param file - Where to write
 * @param keys - The keys to list
 * @param fs - The injected filesystem
 * @returns How many rows were written, and how many were dropped
 */
export async function writeKeyCsv(
  file: string,
  keys: readonly KeyReportLike[],
  fs: FsLike
): Promise<KeyCsvResult> {
  const dir = posixDirname(file)
  if (dir.length > 0) await fs.mkdir(dir, { recursive: true })
  const kept = keys.slice(0, MAX_CSV_ROWS)
  await fs.writeFile(file, toCsv(KEY_COLUMNS, kept.map(keyRow)), 'utf-8')
  return { rows: kept.length, dropped: keys.length - kept.length }
}
