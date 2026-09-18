import { isTranslatable } from '@ptt/parser'
import type {
  ConvertMode,
  GameDefinition,
  LanguageCode,
  TargetContent,
  TranslationTarget
} from '@ptt/shared'
import {
  getLanguageDisplayName,
  normalizeTargets,
  uniqueTargetLanguages
} from '@ptt/shared/languages'

import { applyModJobs } from './apply-generated.js'
import { mapWithConcurrency } from './concurrency.js'
import { MOD_CONCURRENCY, MOD_CONCURRENCY_WITH_BACKEND } from './constants.js'
import { buildCoverage } from './coverage.js'
import { buildDescriptor, pickSupportedVersion } from './descriptor.js'
import { reportModDiagnostics } from './diagnostics.js'
import { discoverMods } from './discover-mods.js'
import { dropOurOwnMod, readGeneratedMod } from './generated-mod.js'
import { planMod } from './key-plan.js'
import { posixJoin } from './path.js'
import type { JobEvent, ProgressPort, TranslationProgress } from './progress.js'
import { IDENTICAL_REASON, NOT_ATTEMPTED_REASON } from './reasons.js'
import { retranslateOwnKeysHasNoEffect } from './retranslate.js'
import { describeInPlaceShadowing, resolveTargets } from './target.js'
import type { ResolvedTarget } from './target.js'
import type {
  ConversionOutput,
  ConversionTotals,
  Destination,
  FsLike,
  KeyReport,
  ModFolder,
  ModPlan,
  ModResult,
  RunReportPort,
  TranslationEnginePort,
  TranslationMemoryPort,
  TranslationMod,
  TranslationSetupPort
} from './types.js'

export type { TranslationEnginePort } from './types.js'

export interface Cancellation {
  requested: boolean
}

export interface ConvertRunOptions {
  jobId: string
  rootDir: string
  game: GameDefinition
  sourceLanguage: LanguageCode
  targets: readonly TranslationTarget[]
  mode: ConvertMode
  outputDir?: string
  selectedMods?: readonly string[]
  generatedMod?: TranslationMod
  generatedModsDir?: string
  targetContent?: TargetContent
  translationSetup?: TranslationSetupPort
  runReport?: RunReportPort
  retranslateOwnKeys?: boolean
  cancellation: Cancellation
}

interface ConvertCoreOptions extends Omit<ConvertRunOptions, 'translationSetup' | 'runReport'> {
  engine?: TranslationEnginePort
  memory?: TranslationMemoryPort
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
  const startedAt = Date.now()
  const setup =
    (await options.translationSetup?.open({
      sourceLanguage: options.sourceLanguage,
      targetLanguages: uniqueTargetLanguages(normalizeTargets(options.targets))
    })) ?? {}

  for (const message of setup.glossaryProblems ?? []) {
    port.emit({ type: 'log', jobId: options.jobId, severity: 'warning', message })
  }

  const result = await runConvertCore(
    {
      ...options,
      ...(setup.engine !== undefined && { engine: setup.engine }),
      ...(setup.memory !== undefined && { memory: setup.memory })
    },
    fs,
    port
  )

  await setup.flush?.()

  const written = await options.runReport?.write({
    startedAt,
    finishedAt: Date.now(),
    output: result.output,
    untranslated: result.untranslated
  })
  if (written !== undefined) {
    result.output.reportPath = written.jsonPath
    result.output.reportFile = written.file
  }

  return result
}

async function runConvertCore(
  options: ConvertCoreOptions,
  fs: FsLike,
  port: ProgressPort
): Promise<ConvertRunResult> {
  const {
    jobId,
    rootDir,
    game,
    sourceLanguage,
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
  let backendDown = false
  const isAbandoned = (): boolean => isCancelled() || backendDown

  const requestedTargets = normalizeTargets(options.targets)

  const destination = resolveDestination(mode, options)
  const targetContent = resolveTargetContent(mode, options)
  const resolved = resolveTargets(game, sourceLanguage, requestedTargets)

  const requestedRetranslateOwnKeys = options.retranslateOwnKeys ?? false
  const hasNoEffect = requestedRetranslateOwnKeys && retranslateOwnKeysHasNoEffect(mode)
  const retranslateOwnKeys = requestedRetranslateOwnKeys && !hasNoEffect
  if (hasNoEffect) {
    emit({
      type: 'log',
      jobId,
      severity: 'warning',
      message:
        'Retranslating own untranslated keys has no effect when adding to the current mod, ' +
        'since the retranslated key would end up defined twice, once in the original file and ' +
        'once in a new one next to it; skipped'
    })
  }

  const targets: ResolvedTarget[] = []
  for (const target of resolved.targets) {
    if (engine === undefined && !target.usesOwnToken) {
      emit({
        type: 'log',
        jobId,
        severity: 'warning',
        message:
          `${getLanguageDisplayName(target.language)} written under "l_${target.fileToken}" ` +
          `needs a translation engine, skipped`
      })
      continue
    }
    if (destination.kind === 'in-place' && target.shadowsLanguage !== undefined) {
      emit({
        type: 'log',
        jobId,
        severity: 'warning',
        message: describeInPlaceShadowing(
          target,
          target.shadowsLanguage,
          targetContent !== 'missing-keys'
        )
      })
    }
    targets.push(target)
  }

  const tokenByLanguage = new Map(targets.map(target => [target.language, target.fileToken]))

  const generated = generatedMod ? await readGeneratedMod(generatedMod.path, game, fs) : undefined
  if (isCancelled())
    return { output: cancelledOutput(requestedTargets, generatedMod), untranslated }

  const discovered = await discoverMods(rootDir, game, fs)
  const { mods: allMods } = dropOurOwnMod(discovered.mods, generatedMod?.folder)
  if (isCancelled())
    return { output: cancelledOutput(requestedTargets, generatedMod), untranslated }

  const coverage = await buildCoverage(allMods, game, sourceLanguage, fs)
  if (isCancelled())
    return { output: cancelledOutput(requestedTargets, generatedMod), untranslated }

  const mods = selectedMods ? allMods.filter(mod => selectedMods.includes(mod.id)) : allMods
  const concurrency = engine ? MOD_CONCURRENCY_WITH_BACKEND : MOD_CONCURRENCY

  let done = 0
  const results = await mapWithConcurrency(mods, concurrency, async mod => {
    if (isAbandoned()) return undefined
    const coverageForMod = coverage.get(mod.id)
    const plan = await planMod(
      mod,
      {
        gameDef: game,
        sourceLanguage,
        targets,
        packed: mode === 'create-translation-mod',
        detail: false,
        targetContent,
        ...(coverageForMod !== undefined && { coverage: coverageForMod }),
        ...(generated !== undefined && { generated }),
        ...(memory !== undefined && { memory }),
        ...(retranslateOwnKeys && { retranslateOwnKeys })
      },
      fs
    )
    if (isCancelled()) return undefined

    const translations = engine
      ? await translateMod(
          plan,
          engine,
          sourceLanguage,
          untranslated,
          mod,
          tokenByLanguage,
          emit,
          jobId
        )
      : undefined
    if (isCancelled()) return undefined

    if (engine !== undefined && engine.isBackendDown() && !backendDown) {
      backendDown = true
      emit({
        type: 'log',
        jobId,
        severity: 'warning',
        message: 'Translation backend reported unavailable; the rest of this run has been abandoned'
      })
    }

    emitPlanErrors(emit, jobId, plan)

    const result = await applyModJobs(
      {
        plan,
        mod,
        gameDef: game,
        sourceLanguage,
        targets,
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
      targets: requestedTargets,
      totals,
      ...(writtenMod !== undefined && { translationMod: writtenMod }),
      ...(engine !== undefined && { translation: engine.getCounters() }),
      ...(isCancelled() && { cancelled: true })
    },
    untranslated
  }
}

function emitPlanErrors(emit: (event: JobEvent) => void, jobId: string, plan: ModPlan): void {
  reportModDiagnostics(
    plan.name,
    plan.errors.map(message => ({ severity: 'error' as const, message })),
    (message, severity) => emit({ type: 'log', jobId, severity, message })
  )
}

export const settledCount = (counters: TranslationProgress): number =>
  counters.translated + counters.cached + counters.failed

export function collectUntranslated(
  plan: ModPlan,
  mod: ModFolder,
  language: string,
  fileToken: string | undefined,
  translated: Map<string, string>,
  describeRefusal: (value: string) => string
): KeyReport[] {
  const out: KeyReport[] = []
  for (const job of plan.jobs[language] ?? []) {
    for (const [key, value] of job.keys) {
      if (job.known.has(key) || !isTranslatable(value)) continue
      const base = {
        modId: mod.id,
        modName: plan.name,
        language,
        key,
        file: job.source,
        source: value,
        state: 'english' as const,
        ...(fileToken !== undefined && { fileToken })
      }
      const response = translated.get(value)
      if (response === undefined) {
        out.push({ ...base, reason: describeRefusal(value) })
        continue
      }
      if (response.trim() === value.trim()) {
        out.push({ ...base, reason: IDENTICAL_REASON, identicalToSource: true })
      }
    }
  }
  return out
}

interface ModTranslations {
  byLanguage: Map<string, Map<string, string>>
  stats: { translated: number; cached: number; failed: number }
}

async function translateMod(
  plan: ModPlan,
  engine: TranslationEnginePort,
  sourceLanguage: LanguageCode,
  untranslated: KeyReport[],
  mod: ModFolder,
  tokenByLanguage: ReadonlyMap<string, string>,
  emit: (event: JobEvent) => void,
  jobId: string
): Promise<ModTranslations> {
  const byLanguage = new Map<string, Map<string, string>>()
  const stats = { translated: 0, cached: 0, failed: 0 }

  for (const [language, jobs] of Object.entries(plan.jobs)) {
    if (language === sourceLanguage || !jobs) continue

    const values: string[] = []
    for (const job of jobs) {
      for (const [key, value] of job.keys) {
        if (!job.known.has(key) && isTranslatable(value)) values.push(value)
      }
    }

    emit({
      type: 'translate-mod',
      jobId,
      modName: plan.name,
      language,
      total: new Set(values).size,
      done: settledCount(engine.getCounters())
    })

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
      ...collectUntranslated(plan, mod, language, tokenByLanguage.get(language), results, value => {
        const refusal = engine.refusalFor(language, value)
        if (!refusal) return NOT_ATTEMPTED_REASON

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

function cancelledOutput(
  targets: readonly TranslationTarget[],
  generatedMod?: TranslationMod
): ConversionOutput {
  return {
    mods: [],
    targets,
    totals: { ...EMPTY_TOTALS },
    cancelled: true,
    ...(generatedMod !== undefined && { translationMod: generatedMod })
  }
}
