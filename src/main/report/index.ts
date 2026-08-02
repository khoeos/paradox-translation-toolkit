/**
 * Reports of what a run actually did, key by key.
 *
 * The counters shown while a run goes on say how many strings were refused, never which
 * ones, so a bad pass could only be investigated by opening the generated files by hand.
 * Every report is written twice: JSON to be read back by a tool, CSV to be opened in a
 * spreadsheet and sorted.
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import type { Refusal, TranslationCounters } from '../translate/engine'
import type { ConversionOutput, KeyReport, ModResult, TranslationMod } from '../../global/types'
import type { Request } from '../translateFn'

/** Rows written to the CSV, a full collection can refuse far more than a spreadsheet holds */
const MAX_CSV_ROWS = 200000

/** Excel reads a UTF-8 CSV as mojibake unless the file opens with a byte order mark */
const BOM = '﻿'

export interface RunReport {
  startedAt: number
  finishedAt: number
  request: Request
  totals: ConversionOutput['totals']
  counters?: TranslationCounters
  refusals?: { list: Refusal[]; dropped: number }
  mods: ModResult[]
  /** Every key written in the source language by this run */
  untranslated: KeyReport[]
  translationMod?: TranslationMod
}

/**
 * Quote one CSV field, Excel opens a file with a stray quote in it as garbage
 * @param value - The raw field
 * @returns The quoted field
 */
const csvField = (value: string | number | undefined): string => {
  const text = String(value ?? '')
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

/**
 * Build a CSV document
 * @param header - The column names
 * @param rows - The rows, already in column order
 * @returns The CSV content, with the BOM Excel needs to read UTF-8
 */
export const toCsv = (header: string[], rows: (string | number | undefined)[][]): string =>
  `${BOM}${[header, ...rows].map((row) => row.map(csvField).join(',')).join('\r\n')}\r\n`

/** Columns of the key level CSV, shared by the run report and the audit */
const KEY_COLUMNS = [
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
]

/**
 * One key report as a CSV row
 * @param key - The key report
 * @returns The row, in KEY_COLUMNS order
 */
const keyRow = (key: KeyReport): (string | number | undefined)[] => [
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

/**
 * Write a key level CSV
 * @param file - Where to write
 * @param keys - The keys to list
 */
export const writeKeyCsv = async (file: string, keys: KeyReport[]): Promise<void> => {
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, toCsv(KEY_COLUMNS, keys.slice(0, MAX_CSV_ROWS).map(keyRow)), 'utf8')
}

/** A file name that sorts by date and holds no character Windows refuses */
const stamp = (at: number): string => new Date(at).toISOString().replace(/[:.]/g, '-')

/**
 * Write the report of a finished run
 * @param directory - The reports folder
 * @param report - What the run did
 * @returns The path of the JSON report, undefined when it could not be written
 */
export const writeRunReport = async (
  directory: string,
  report: RunReport
): Promise<string | undefined> => {
  const base = path.join(directory, `run-${stamp(report.startedAt)}`)

  try {
    await fs.mkdir(directory, { recursive: true })
    await fs.writeFile(
      `${base}.json`,
      JSON.stringify(
        {
          startedAt: new Date(report.startedAt).toISOString(),
          finishedAt: new Date(report.finishedAt).toISOString(),
          seconds: Math.round((report.finishedAt - report.startedAt) / 1000),
          // The api key has no place in a file the user may hand around
          request: {
            path: report.request.path,
            game: report.request.game,
            mode: report.request.mode,
            sourceLanguage: report.request.sourceLanguage,
            targetLanguages: report.request.targetLanguages,
            selectedMods: report.request.selectedMods?.length ?? 'all',
            translate: report.request.translate && {
              provider: report.request.translate.provider,
              model: report.request.translate.model,
              batchSize: report.request.translate.batchSize,
              concurrency: report.request.translate.concurrency
            }
          },
          translationMod: report.translationMod,
          totals: report.totals,
          counters: report.counters,
          refusalsByReason: countByReason(report.refusals?.list ?? []),
          refusalsDropped: report.refusals?.dropped ?? 0,
          mods: report.mods.map((mod) => ({
            id: mod.id,
            name: mod.name,
            created: mod.createdCount,
            skipped: mod.skippedCount,
            failed: mod.failedCount,
            pruned: mod.prunedCount,
            translation: mod.translation,
            errors: mod.errors
          })),
          untranslated: report.untranslated
        },
        null,
        2
      ),
      'utf8'
    )

    await writeKeyCsv(`${base}.csv`, report.untranslated)
    return `${base}.json`
  } catch {
    // A run must not be lost because its report could not be written
    return undefined
  }
}

/**
 * How many strings each kind of refusal cost
 * @param refusals - The refusals of a run
 * @returns Reason to count
 */
export const countByReason = (refusals: Refusal[]): Record<string, number> => {
  const counts: Record<string, number> = {}
  for (const refusal of refusals) counts[refusal.reason] = (counts[refusal.reason] ?? 0) + 1
  return counts
}
