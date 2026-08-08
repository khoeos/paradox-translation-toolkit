import { isTranslatable } from '@ptt/parser-core'
import type { ConvertMode, GameDefinition, LanguageCode } from '@ptt/shared-types'

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

/**
 * One run of the mod-level pipeline.
 *
 * Ported from PR #4 (e21ee7a, `src/main/translateFn/index.ts` `launchTranslation`) by
 * Artem Kondrashev.
 *
 * It lives here rather than in the desktop worker because `apps/cli` runs the very same thing:
 * audit finding 2.7 of the recap, "the worker of the app and the CLI must consume exactly the same
 * contract", is what guarantees the two do the same work rather than two similar things. The
 * translation engine is injected as a port, so this package still knows nothing about a backend.
 */

/**
 * The translation engine, as seen from here.
 *
 * A port rather than the class, for the same reason as `TranslationMemoryPort`: converter-core must
 * not depend on the translation subsystem.
 */
export interface TranslationEnginePort {
  translate(
    values: readonly string[],
    language: LanguageCode
  ): Promise<{ results: Map<string, string>; stats: TranslationProgress }>
  refusalFor(language: LanguageCode, value: string): { reason: string; detail?: string } | undefined
  getCounters(): TranslationProgress
}

/**
 * The stop flag, consulted between units of work.
 *
 * Only the flag: cutting a request in flight is an `AbortSignal` the caller hands to the engine, and
 * this package has no notion of a network call.
 */
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
  /** Mod folder names to process; every discovered mod when left out. */
  selectedMods?: readonly string[]
  /** Where the generated mod goes, resolved by the main process. */
  generatedMod?: TranslationMod
  /** The `.mod` folder the launcher reads, for the outer descriptor. */
  generatedModsDir?: string
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

/**
 * Run a conversion over a whole collection.
 * @param options - See `ConvertRunOptions`
 * @param fs - The injected filesystem
 * @param port - Where progress goes
 * @returns What the run did, mod by mod
 */
export interface ConvertRunResult {
  output: ConversionOutput
  /** Every key this run wrote in the source language, for the run report. */
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

  // Everything below is read before a single file is written, and each step is a cancellation
  // checkpoint: audit findings S-9 and S-10, where Cancel was a no-op through all of it.
  const generated = generatedMod ? await readGeneratedMod(generatedMod.path, game, fs) : undefined
  if (isCancelled()) return { output: cancelledOutput(generatedMod), untranslated }

  const discovered = await discoverMods(rootDir, game, fs)
  const { mods: allMods } = dropOurOwnMod(discovered.mods, generatedMod?.folder)
  if (isCancelled()) return { output: cancelledOutput(generatedMod), untranslated }

  const coverage = await buildCoverage(allMods, game, sourceLanguage, fs)
  if (isCancelled()) return { output: cancelledOutput(generatedMod), untranslated }

  const mods = selectedMods ? allMods.filter(mod => selectedMods.includes(mod.id)) : allMods
  // The backend is the bottleneck as soon as translation is on.
  const concurrency = engine ? MOD_CONCURRENCY_WITH_BACKEND : MOD_CONCURRENCY
  const destination = resolveDestination(mode, options)

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

  // The descriptors go in once, after the mods, and only when the generated mod holds something.
  // `unchanged` counts too: a second run over an already complete mod creates nothing, and
  // gating on `created` alone left that run reporting no translation mod at all and never
  // refreshing the outer `.mod` file the launcher reads.
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

/** Every key this run writes in the source language, so the next one knows what to retry. */
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

    // Only what is still untranslated: sending the whole source file would pay again for strings
    // another mod, or an earlier run of ours, already covered.
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
      // Backend down: fall back to copying, the run keeps its meaning.
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

/**
 * Both descriptors a generated mod needs: the outer one the launcher reads, and the inner one
 * the game reads.
 */
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
