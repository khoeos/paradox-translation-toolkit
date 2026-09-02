import type { ConversionTotals, FsLike, KeyReport, ModResult, TranslationMod } from '@ptt/converter'
import { posixJoin } from '@ptt/converter'
import type { ConvertMode, LanguageCode, TargetContent } from '@ptt/shared'
import type { Refusal, RefusalReason, TranslateProvider, TranslationCounters } from '@ptt/translate'

import { writeKeyCsv } from './csv.js'
import { stamp } from './stamp.js'

export interface RunReportRequest {
  path: string
  game: string
  mode: ConvertMode
  targetContent: TargetContent
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
  untranslated: readonly KeyReport[]
  translationMod?: TranslationMod
}

export interface TranslateConfigLike {
  provider: TranslateProvider
  model: string
  batchSize: number
  concurrency: number
}

export interface RunReportInputs {
  startedAt: number
  finishedAt: number
  rootDir: string
  gameId: string
  mode: ConvertMode
  targetContent: TargetContent
  sourceLanguage: LanguageCode
  targetLanguages: readonly LanguageCode[]
  selectedMods?: readonly string[]
  translate?: TranslateConfigLike
  output: { totals: ConversionTotals; mods: readonly ModResult[]; translationMod?: TranslationMod }
  untranslated: readonly KeyReport[]
  counters?: TranslationCounters
  refusals?: { list: readonly Refusal[]; dropped: number }
}

export function buildRunReport(inputs: RunReportInputs): RunReport {
  return {
    startedAt: inputs.startedAt,
    finishedAt: inputs.finishedAt,
    request: {
      path: inputs.rootDir,
      game: inputs.gameId,
      mode: inputs.mode,
      targetContent: inputs.targetContent,
      sourceLanguage: inputs.sourceLanguage,
      targetLanguages: inputs.targetLanguages,
      ...(inputs.selectedMods !== undefined && { selectedMods: inputs.selectedMods }),
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

export function countByReason(
  refusals: readonly Refusal[]
): Partial<Record<RefusalReason, number>> {
  const counts: Partial<Record<RefusalReason, number>> = {}
  for (const refusal of refusals) {
    counts[refusal.reason] = (counts[refusal.reason] ?? 0) + 1
  }
  return counts
}
