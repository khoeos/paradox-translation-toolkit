import { isTranslatable } from '@ptt/parser'
import type {
  ConvertMode,
  GameDefinition,
  LanguageCode,
  TargetContent
} from '@ptt/shared'

import { applyModJobs } from './apply-generated.js'
import { mapWithConcurrency } from './concurrency.js'
import { MOD_CONCURRENCY, MOD_CONCURRENCY_WITH_BACKEND } from './constants.js'
import { buildCoverage } from './coverage.js'
import { buildDescriptor, pickSupportedVersion } from './descriptor.js'
import { discoverMods } from './discover-mods.js'
import { dropOurOwnMod, readGeneratedMod } from './generated-mod.js'
import { planMod } from './key-plan.js'
import { posixJoin } from './path.js'
import type { JobEvent, ProgressPort, TranslationProgress } from './progress.js'
import type {
  ConversionOutput,
  ConversionTotals,
  Destination,
  FsLike,
  KeyReport,
  ModFolder,
  ModPlan,
  ModResult,
  TranslationMemoryPort,
  TranslationMod
} from './types.js'

export interface TranslationEnginePort {
  translate(
    values: readonly string[],
    language: LanguageCode
  ): Promise<{ results: Map<string, string>; stats: TranslationProgress }>
  refusalFor(language: LanguageCode, value: string): { reason: string; detail?: string } | undefined
  getCounters(): TranslationProgress
}

export interface Cancellation {
  requested: boolean
}

export interface ConvertRunOptions {
  jobId: string
  rootDir: string
  game: GameDefinition
  sourceLanguage: LanguageCode
  targetLanguages: readonly LanguageCode[]
  mode: ConvertMode
  outputDir?: string
  selectedMods?: readonly string[]
  generatedMod?: TranslationMod
  generatedModsDir?: string
  targetContent?: TargetContent
  engine?: TranslationEnginePort
  memory?: TranslationMemoryPort
  cancellation: Cancellation
}

const EMPTY_TOTALS: ConversionTotals = {
  mods: 0,
  modsWithFiles: 0,
  created: 0,
  skipped: 0,
  unchanged: 0,
  failed: 0,
  pruned: 0,
  errors: 0
}

export interface ConvertRunResult {
  output: ConversionOutput
  untranslated: KeyReport[]
}

export async function runConvert(
  options: ConvertRunOptions,
  fs: FsLike,
  port: ProgressPort
): Promise<ConvertRunResult> {
  const {
    jobId,
    rootDir,
    game,
    sourceLanguage,
    targetLanguages,
    mode,
    selectedMods,
    generatedMod,
    generatedModsDir,
    engine,
    memory,
    cancellation
  } = options

  const emit = (event: JobEvent): void => port.emit(event)
  const isCancelled = (): boolean => cancellation.requested
  const untranslated: KeyReport[] = []

  const generated = generatedMod ? await readGeneratedMod(generatedMod.path, game, fs) : undefined
  if (isCancelled()) return { output: cancelledOutput(generatedMod), untranslated }

  const discovered = await discoverMods(rootDir, game, fs)
  const { mods: allMods } = dropOurOwnMod(discovered.mods, generatedMod?.folder)
  if (isCancelled()) return { output: cancelledOutput(generatedMod), untranslated }

  const coverage = await buildCoverage(allMods, game, sourceLanguage, fs)
  if (isCancelled()) return { output: cancelledOutput(generatedMod), untranslated }

  const mods = selectedMods ? allMods.filter(mod => selectedMods.includes(mod.id)) : allMods
  const concurrency = engine ? MOD_CONCURRENCY_WITH_BACKEND : MOD_CONCURRENCY
  const destination = resolveDestination(mode, options)
  const targetContent = resolveTargetContent(mode, options)

  let done = 0
  const results = await mapWithConcurrency(mods, concurrency, async mod => {
    if (isCancelled()) return undefined
    const coverageForMod = coverage.get(mod.id)
    const plan = await planMod(
      mod,
      {
        gameDef: game,
        sourceLanguage,
        targetLanguages,
        packed: mode === 'create-translation-mod',
        detail: false,
        targetContent,
        ...(coverageForMod !== undefined && { coverage: coverageForMod }),
        ...(generated !== undefined && { generated }),
        ...(memory !== undefined && { memory })
      },
      fs
    )
    if (isCancelled()) return undefined

    const translations = engine
      ? await translateMod(plan, engine, sourceLanguage, untranslated, mod, emit, jobId)
      : undefined
    if (isCancelled()) return undefined

    const result = await applyModJobs(
      {
        plan,
        mod,
        gameDef: game,
        sourceLanguage,
        targetLanguages,
        destination,
        isCancelled,
        ...(translations !== undefined && { translations: translations.byLanguage })
      },
      fs
    )
    if (translations?.stats) result.translation = translations.stats

    done++
    emit({ type: 'mod-progress', jobId, processed: done, total: mods.length, modName: result.name })
    return result
  })

  const present = results.filter((result): result is ModResult => result !== undefined)
  const totals = present.reduce<ConversionTotals>(
    (acc, mod) => ({
      mods: acc.mods + 1,
      modsWithFiles: acc.modsWithFiles + (mod.createdCount > 0 ? 1 : 0),
      created: acc.created + mod.createdCount,
      skipped: acc.skipped + mod.skippedCount,
      unchanged: acc.unchanged + mod.unchangedCount,
      failed: acc.failed + mod.failedCount,
      pruned: acc.pruned + mod.prunedCount,
      errors: acc.errors + mod.errors.length
    }),
    { ...EMPTY_TOTALS }
  )

  const wroteAnything = totals.created > 0 || totals.unchanged > 0
  let writtenMod: TranslationMod | undefined
  if (generatedMod && generatedModsDir && wroteAnything && !isCancelled()) {
    writtenMod = { ...generatedMod, supportedVersion: pickSupportedVersion(present) }
    await writeDescriptors(writtenMod, generatedModsDir, fs)
  }

  return {
    output: {
      mods: present,
      totals,
      ...(writtenMod !== undefined && { translationMod: writtenMod }),
      ...(engine !== undefined && { translation: engine.getCounters() }),
      ...(isCancelled() && { cancelled: true })
    },
    untranslated
  }
}

export function collectUntranslated(
  plan: ModPlan,
  mod: ModFolder,
  language: LanguageCode,
  translated: Map<string, string>,
  describeRefusal: (value: string) => string
): KeyReport[] {
  const out: KeyReport[] = []
  for (const job of plan.jobs[language] ?? []) {
    for (const [key, value] of job.keys) {
      if (job.known.has(key) || !isTranslatable(value) || translated.has(value)) continue
      out.push({
        modId: mod.id,
        modName: plan.name,
        language,
        key,
        file: job.source,
        source: value,
        state: 'english',
        reason: describeRefusal(value)
      })
    }
  }
  return out
}

interface ModTranslations {
  byLanguage: Map<LanguageCode, Map<string, string>>
  stats: { translated: number; cached: number; failed: number }
}

async function translateMod(
  plan: ModPlan,
  engine: TranslationEnginePort,
  sourceLanguage: LanguageCode,
  untranslated: KeyReport[],
  mod: ModFolder,
  emit: (event: JobEvent) => void,
  jobId: string
): Promise<ModTranslations> {
  const byLanguage = new Map<LanguageCode, Map<string, string>>()
  const stats = { translated: 0, cached: 0, failed: 0 }

  for (const [languageRaw, jobs] of Object.entries(plan.jobs)) {
    const language = languageRaw as LanguageCode
    if (language === sourceLanguage || !jobs) continue

    const values: string[] = []
    for (const job of jobs) {
      for (const [key, value] of job.keys) {
        if (!job.known.has(key) && isTranslatable(value)) values.push(value)
      }
    }

    let results = new Map<string, string>()
    try {
      const outcome = await engine.translate(values, language)
      results = outcome.results
      stats.translated += outcome.stats.translated
      stats.cached += outcome.stats.cached
      stats.failed += outcome.stats.failed
    } catch (err) {
      plan.errors.push(`${language} : ${err instanceof Error ? err.message : String(err)}`)
    }
    byLanguage.set(language, results)
    emit({ type: 'translate-progress', jobId, counters: engine.getCounters() })

    untranslated.push(
      ...collectUntranslated(plan, mod, language, results, value => {
        const refusal = engine.refusalFor(language, value)
        if (!refusal) return 'not attempted'
        return refusal.detail ? `${refusal.reason}: ${refusal.detail}` : refusal.reason
      })
    )
  }

  return { byLanguage, stats }
}

function resolveDestination(mode: ConvertMode, options: ConvertRunOptions): Destination {
  if (mode === 'create-translation-mod' && options.generatedMod) {
    return { kind: 'translation-mod', mod: options.generatedMod }
  }
  if (mode === 'extract-to-folder' && options.outputDir !== undefined) {
    return { kind: 'output-dir', outputDir: options.outputDir }
  }
  return { kind: 'in-place' }
}

function resolveTargetContent(mode: ConvertMode, options: ConvertRunOptions): TargetContent {
  if (mode !== 'add-to-current') return 'missing-keys'
  return options.targetContent ?? 'missing-keys'
}

async function writeDescriptors(mod: TranslationMod, modsDir: string, fs: FsLike): Promise<void> {
  await fs.mkdir(mod.path, { recursive: true })
  await fs.writeFile(posixJoin(mod.path, 'descriptor.mod'), buildDescriptor(mod, false), 'utf-8')
  await fs.writeFile(posixJoin(modsDir, `${mod.folder}.mod`), buildDescriptor(mod, true), 'utf-8')
}

function cancelledOutput(generatedMod?: TranslationMod): ConversionOutput {
  return {
    mods: [],
    totals: { ...EMPTY_TOTALS },
    cancelled: true,
    ...(generatedMod !== undefined && { translationMod: generatedMod })
  }
}
