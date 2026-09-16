import { mapWithConcurrency, posixJoin } from '@ptt/converter'
import type { ConvertMode, FsDirEntry, FsLike, LanguageCode, TargetContent } from '@ptt/shared'

import type { ParsedRunReport, ParsedRunReportMeta } from './schema.js'
import { StoredRunReportMetaSchema, StoredRunReportSchema } from './schema.js'

const STAT_CONCURRENCY = 16

export type RunOutcome = 'clean' | 'issues' | 'failed' | 'cancelled'

export interface RunReportFile {
  file: string
  jsonPath: string
  csvPath: string
  csvExists: boolean
}

export interface RunReportFileList {
  files: RunReportFile[]
  truncated: boolean
}

export interface ListRunReportFilesOptions {
  limit?: number
}

export interface RunReportMeta extends ParsedRunReportMeta {
  untranslatedCount: number
}

export interface RunReportSummary {
  file: string
  jsonPath: string
  csvPath: string
  csvExists: boolean
  startedAt: string
  finishedAt: string
  seconds: number
  game: string
  mode: ConvertMode
  targetContent?: TargetContent
  sourceLanguage: LanguageCode
  targetLanguages: readonly LanguageCode[]
  selectedMods: number | 'all'
  rootPath: string
  translationModName?: string
  created: number
  failed: number
  errors: number
  skipped: number
  pruned: number
  mods: number
  modsWithFiles: number
  modsWithErrors: number
  cancelled: boolean
  outcome: RunOutcome
}

export const RUN_REPORT_FILE_PATTERN = /^run-[A-Za-z0-9._-]+\.json$/

export function isRunReportFileName(name: string): boolean {
  return RUN_REPORT_FILE_PATTERN.test(name)
}

export function buildCsvSiblingPath(jsonPath: string): string {
  return `${jsonPath.slice(0, -'.json'.length)}.csv`
}

export async function listRunReportFiles(
  directory: string,
  fs: FsLike,
  options: ListRunReportFilesOptions = {}
): Promise<RunReportFileList> {
  let entries: FsDirEntry[]
  try {
    entries = await fs.readdir(directory)
  } catch {
    return { files: [], truncated: false }
  }

  const names = entries
    .filter(entry => entry.isFile && isRunReportFileName(entry.name))
    .map(entry => entry.name)
    .toSorted()
    .toReversed()

  const { limit } = options
  const truncated = limit !== undefined && names.length > limit
  const kept = limit === undefined ? names : names.slice(0, limit)

  const files = await mapWithConcurrency(kept, STAT_CONCURRENCY, async file => {
    const jsonPath = posixJoin(directory, file)
    const csvPath = buildCsvSiblingPath(jsonPath)
    return { file, jsonPath, csvPath, csvExists: await fs.exists(csvPath) }
  })
  return { files, truncated }
}

async function readRunReportJson(path: string, fs: FsLike): Promise<unknown> {
  const raw = await fs.readFile(path, 'utf-8')
  try {
    return JSON.parse(raw)
  } catch (err) {
    throw new Error(
      `${path} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err }
    )
  }
}

interface SchemaIssue {
  readonly path: readonly PropertyKey[]
  readonly message: string
}

function unreadableReport(path: string, issues: readonly SchemaIssue[]): Error {
  const first = issues[0]
  const where = first ? `${first.path.join('.')}: ${first.message}` : 'unknown field'
  return new Error(`${path} is not a run report this build understands (${where})`)
}

function legacyUntranslatedCount(parsed: unknown): number {
  if (typeof parsed !== 'object' || parsed === null || !('untranslated' in parsed)) return 0
  const untranslated = parsed.untranslated
  return Array.isArray(untranslated) ? untranslated.length : 0
}

export async function readRunReport(path: string, fs: FsLike): Promise<ParsedRunReport> {
  const parsed = await readRunReportJson(path, fs)
  const validated = StoredRunReportSchema.safeParse(parsed)
  if (!validated.success) throw unreadableReport(path, validated.error.issues)
  return validated.data
}

export async function readRunReportMeta(path: string, fs: FsLike): Promise<RunReportMeta> {
  const parsed = await readRunReportJson(path, fs)
  const validated = StoredRunReportMetaSchema.safeParse(parsed)
  if (!validated.success) throw unreadableReport(path, validated.error.issues)
  return {
    ...validated.data,
    untranslatedCount: validated.data.untranslatedCount ?? legacyUntranslatedCount(parsed)
  }
}

export function getRunOutcome(totals: {
  failed: number
  errors: number
  cancelled?: boolean
}): RunOutcome {
  if (totals.cancelled === true) return 'cancelled'
  if (totals.failed > 0) return 'failed'
  if (totals.errors > 0) return 'issues'
  return 'clean'
}

export function buildRunReportSummary(
  file: RunReportFile,
  report: ParsedRunReportMeta
): RunReportSummary {
  const cancelled = report.cancelled === true
  return {
    file: file.file,
    jsonPath: file.jsonPath,
    csvPath: file.csvPath,
    csvExists: file.csvExists,
    startedAt: report.startedAt,
    finishedAt: report.finishedAt,
    seconds: report.seconds,
    game: report.request.game,
    mode: report.request.mode,
    ...(report.request.targetContent !== undefined && {
      targetContent: report.request.targetContent
    }),
    sourceLanguage: report.request.sourceLanguage,
    targetLanguages: report.request.targetLanguages,
    selectedMods: report.request.selectedMods,
    rootPath: report.request.path,
    ...(report.translationMod !== undefined && { translationModName: report.translationMod.name }),
    created: report.totals.created,
    failed: report.totals.failed,
    errors: report.totals.errors,
    skipped: report.totals.skipped,
    pruned: report.totals.pruned,
    mods: report.totals.mods,
    modsWithFiles: report.totals.modsWithFiles,
    modsWithErrors: report.mods.filter(mod => mod.errors.length > 0).length,
    cancelled,
    outcome: getRunOutcome({
      failed: report.totals.failed,
      errors: report.totals.errors,
      cancelled
    })
  }
}
