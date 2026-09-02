import type { FsLike, KeyReport } from '@ptt/converter'
import { posixDirname } from '@ptt/converter'

export const MAX_CSV_ROWS = 200_000

export const BOM = '﻿'

const FORMULA_PREFIXES = new Set(['=', '+', '-', '@', '\t', '\r'])

export type CsvValue = string | number | undefined

export interface KeyReportLike extends Omit<
  KeyReport,
  'provider' | 'reason' | 'markupOnly' | 'shadowed'
> {
  provider?: string | undefined
  reason?: string | undefined
  markupOnly?: boolean | undefined
  shadowed?: boolean | undefined
}

export function csvField(value: CsvValue): string {
  const text = String(value ?? '')
  const neutralised = FORMULA_PREFIXES.has(text.charAt(0))
  const safe = neutralised ? `'${text}` : text
  const mustQuote = neutralised || /[",\n\r\t]/.test(safe)
  return mustQuote ? `"${safe.replaceAll('"', '""')}"` : safe
}

export function toCsv(header: readonly string[], rows: ReadonlyArray<readonly CsvValue[]>): string {
  const lines = [header, ...rows].map(row => row.map(csvField).join(','))
  return `${BOM}${lines.join('\r\n')}\r\n`
}

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
  rows: number
  dropped: number
}

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
