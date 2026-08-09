/**
 * Reports of what a run actually did, key by key.
 *
 * Ported from PR #4 (e21ee7a, `src/main/report/index.ts`) by Artem Kondrashev.
 *
 * The counters shown while a run goes on say how many strings were refused, never which ones, so
 * a bad pass could only be investigated by opening the generated files by hand. Every report is
 * written twice: JSON to be read back by a tool, CSV to be opened in a spreadsheet and sorted.
 */

import type {
  ConversionTotals,
  FsLike,
  KeyReport,
  ModResult,
  TranslationMod
} from '@ptt/converter'
import { posixJoin } from '@ptt/converter'
import type { ConvertMode, LanguageCode } from '@ptt/shared'
import type {
  Refusal,
  RefusalReason,
  TranslateProvider,
  TranslationCounters
} from '@ptt/translate'

import { writeKeyCsv } from './csv.js'
import { stamp } from './stamp.js'

/**
 * The part of a run's request that goes into a report.
 *
 * The API key is absent from the type, not redacted from a wider one: a report is a file the
 * user may hand around, so leaking the key has to be impossible rather than merely avoided.
 */
export interface RunReportRequest {
  path: string
  game: string
  mode: ConvertMode
  sourceLanguage: LanguageCode
  targetLanguages: readonly LanguageCode[]
  selectedMods?: readonly string[]
  translate?: {
    provider: TranslateProvider
    model: string
    batchSize: number
    concurrency: number
  }
}

export interface RunReport {
  startedAt: number
  finishedAt: number
  request: RunReportRequest
  totals: ConversionTotals
  counters?: TranslationCounters
  refusals?: { list: readonly Refusal[]; dropped: number }
  mods: readonly ModResult[]
  /** Every key this run wrote in the source language. */
  untranslated: readonly KeyReport[]
  translationMod?: TranslationMod
}

/** Anything carrying the four backend settings a report records, `TranslateConfig` included. */
export interface TranslateConfigLike {
  provider: TranslateProvider
  model: string
  batchSize: number
  concurrency: number
}

/** What a caller has in hand at the end of a run, before it becomes a `RunReport`. */
export interface RunReportInputs {
  startedAt: number
  finishedAt: number
  rootDir: string
  gameId: string
  mode: ConvertMode
  sourceLanguage: LanguageCode
  targetLanguages: readonly LanguageCode[]
  selectedMods?: readonly string[]
  /**
   * The backend settings of the run, absent when nothing was translated. The whole config may be
   * handed over: `buildRunReport` projects the four fields a report carries, so the API key cannot
   * reach the file even if a caller passes it.
   */
  translate?: TranslateConfigLike
  output: { totals: ConversionTotals; mods: readonly ModResult[]; translationMod?: TranslationMod }
  untranslated: readonly KeyReport[]
  counters?: TranslationCounters
  refusals?: { list: readonly Refusal[]; dropped: number }
}

/**
 * Assemble the report of a finished run.
 *
 * Here rather than in each front end: the desktop worker and `apps/cli` built this object literal
 * field for field, identically, so a new field would have landed in one of the two reports only
 * while `StoredRunReportSchema` kept validating both.
 * @param inputs - See `RunReportInputs`
 * @returns The report, ready for `writeRunReport`
 */
export function buildRunReport(inputs: RunReportInputs): RunReport {
  return {
    startedAt: inputs.startedAt,
    finishedAt: inputs.finishedAt,
    request: {
      path: inputs.rootDir,
      game: inputs.gameId,
      mode: inputs.mode,
      sourceLanguage: inputs.sourceLanguage,
      targetLanguages: inputs.targetLanguages,
      ...(inputs.selectedMods !== undefined && { selectedMods: inputs.selectedMods }),
      // Field by field, never a spread: a report is a file the user may hand around, and an
      // `apiKey` riding along on a wider config object must be impossible, not merely avoided.
      ...(inputs.translate !== undefined && {
        translate: {
          provider: inputs.translate.provider,
          model: inputs.translate.model,
          batchSize: inputs.translate.batchSize,
          concurrency: inputs.translate.concurrency
        }
      })
    },
    totals: inputs.output.totals,
    mods: inputs.output.mods,
    untranslated: inputs.untranslated,
    ...(inputs.counters !== undefined && { counters: inputs.counters }),
    ...(inputs.refusals !== undefined && { refusals: inputs.refusals }),
    ...(inputs.output.translationMod !== undefined && {
      translationMod: inputs.output.translationMod
    })
  }
}

/** The shape written to disk, named so reading it back is not a matter of convention (Q-8). */
export interface StoredRunReport {
  startedAt: string
  finishedAt: string
  seconds: number
  request: StoredRunRequest
  translationMod?: TranslationMod
  totals: ConversionTotals
  counters?: TranslationCounters
  refusalsByReason: Partial<Record<RefusalReason, number>>
  refusalsDropped: number
  mods: StoredModResult[]
  untranslated: readonly KeyReport[]
}

export interface StoredRunRequest extends Omit<RunReportRequest, 'selectedMods'> {
  /** How many mods were selected, or `all` when the run took everything it found. */
  selectedMods: number | 'all'
}

export interface StoredModResult {
  id: string
  name: string
  created: number
  skipped: number
  unchanged: number
  failed: number
  pruned: number
  translation?: TranslationCounters
  errors: string[]
}

export interface WrittenReport {
  jsonPath: string
  csvPath: string
  csvRows: number
  csvDropped: number
}

/**
 * Write the report of a finished run.
 * @param directory - The reports folder
 * @param report - What the run did
 * @param fs - The injected filesystem
 * @returns Where it was written, or undefined when it could not be: a run must not be lost
 *   because its report could not be saved
 */
export async function writeRunReport(
  directory: string,
  report: RunReport,
  fs: FsLike
): Promise<WrittenReport | undefined> {
  const base = posixJoin(directory, `run-${stamp(report.startedAt)}`)
  const jsonPath = `${base}.json`
  const csvPath = `${base}.csv`

  try {
    await fs.mkdir(directory, { recursive: true })
    await fs.writeFile(jsonPath, `${JSON.stringify(toStored(report), null, 2)}\n`, 'utf-8')
    const csv = await writeKeyCsv(csvPath, report.untranslated, fs)
    return { jsonPath, csvPath, csvRows: csv.rows, csvDropped: csv.dropped }
  } catch {
    return undefined
  }
}

/** The in-memory report as the shape that goes to disk. */
export function toStored(report: RunReport): StoredRunReport {
  return {
    startedAt: new Date(report.startedAt).toISOString(),
    finishedAt: new Date(report.finishedAt).toISOString(),
    seconds: Math.round((report.finishedAt - report.startedAt) / 1000),
    request: {
      ...report.request,
      selectedMods: report.request.selectedMods?.length ?? 'all'
    },
    ...(report.translationMod !== undefined && { translationMod: report.translationMod }),
    totals: report.totals,
    ...(report.counters !== undefined && { counters: report.counters }),
    refusalsByReason: countByReason(report.refusals?.list ?? []),
    refusalsDropped: report.refusals?.dropped ?? 0,
    mods: report.mods.map(mod => ({
      id: mod.id,
      name: mod.name,
      created: mod.createdCount,
      skipped: mod.skippedCount,
      unchanged: mod.unchangedCount,
      failed: mod.failedCount,
      pruned: mod.prunedCount,
      ...(mod.translation !== undefined && { translation: mod.translation }),
      errors: mod.errors
    })),
    untranslated: report.untranslated
  }
}

/**
 * How many strings each kind of refusal cost.
 * @param refusals - The refusals of a run
 * @returns Reason to count
 */
export function countByReason(
  refusals: readonly Refusal[]
): Partial<Record<RefusalReason, number>> {
  const counts: Partial<Record<RefusalReason, number>> = {}
  for (const refusal of refusals) {
    counts[refusal.reason] = (counts[refusal.reason] ?? 0) + 1
  }
  return counts
}
