import type { LanguageCode, TargetContent } from '@ptt/shared'

import { mapWithConcurrency } from './concurrency.js'
import { MOD_CONCURRENCY, SCAN_DIAGNOSTICS_PER_MOD } from './constants.js'
import { buildCoverage } from './coverage.js'
import type { DiagnosticSeverity, ModDiagnostic } from './diagnostics.js'
import { discoverMods } from './discover-mods.js'
import { dropOurOwnMod, readGeneratedMod, summariseGeneratedMod } from './generated-mod.js'
import type { ScanPhase, ScanRunningTotals } from './progress.js'
import { scanMod } from './scan-mod.js'
import { sumByLanguage } from './totals.js'
import type {
  Coverage,
  FsLike,
  GameContextRef,
  GeneratedMod,
  ScanOutput,
  ScanTotals,
  ScannedMod,
  TranslationMemoryPort
} from './types.js'

export interface ScanModsOptions {
  rootDir: string
  gameDef: GameContextRef
  sourceLanguage: LanguageCode
  targetLanguages: readonly LanguageCode[]
  generatedModPath?: string
  generatedModFolder?: string
  memory?: TranslationMemoryPort
  targetContent?: TargetContent
  countLines?: boolean
  detail?: boolean
  onProgress?: (done: number, total: number, modName: string, totals: ScanRunningTotals) => void
  onPhase?: (phase: ScanPhase, done?: number, total?: number) => void
  onDiagnostic?: (message: string, severity: DiagnosticSeverity) => void
  isCancelled?: () => boolean
}

const EMPTY_TOTALS: ScanTotals = {
  mods: 0,
  missingFiles: 0,
  missingLines: 0,
  withoutLocalisation: 0,
  otherSpelling: 0,
  coveredKeys: 0,
  englishKeys: 0,
  keptKeys: 0,
  shadowedKeys: 0,
}

const accumulate = (running: ScanRunningTotals, mod: ScannedMod): void => {
  running.files += mod.localisationFiles
  running.missingFiles += mod.missingFiles
  running.missingLines += mod.missingLines
  if (mod.localisationFiles === 0) running.withoutLocalisation += 1
  if (mod.otherSpelling) running.otherSpelling += 1
  running.errors += mod.errors.length
  running.warnings += mod.warnings?.length ?? 0
}

const reportMod = (
  mod: ScannedMod,
  onDiagnostic: (message: string, severity: DiagnosticSeverity) => void
): void => {
  if (mod.localisationFiles === 0) {
    onDiagnostic(`${mod.name} : no localisation folder for this game`, 'warning')
  }
  if (mod.otherSpelling) {
    onDiagnostic(
      `${mod.name} : uses the other spelling of "localisation", wrong game selected?`,
      'warning'
    )
  }

  const problems: ModDiagnostic[] = [
    ...mod.errors.map(message => ({ severity: 'error' as const, message })),
    ...(mod.warnings ?? []).map(message => ({ severity: 'warning' as const, message }))
  ]
  for (const problem of problems.slice(0, SCAN_DIAGNOSTICS_PER_MOD)) {
    onDiagnostic(`${mod.name} : ${problem.message}`, problem.severity)
  }
  const hidden = problems.length - SCAN_DIAGNOSTICS_PER_MOD
  if (hidden > 0) onDiagnostic(`${mod.name} : and ${hidden} more problem(s) not shown`, 'warning')
}

export async function scanMods(options: ScanModsOptions, fs: FsLike): Promise<ScanOutput> {
  const {
    rootDir,
    gameDef,
    sourceLanguage,
    targetLanguages,
    generatedModPath,
    generatedModFolder,
    memory,
    targetContent,
    countLines = false,
    detail = false,
    onProgress,
    onPhase,
    onDiagnostic,
    isCancelled
  } = options

  onPhase?.('reading-generated')
  const generated: GeneratedMod | undefined = generatedModPath
    ? await readGeneratedMod(generatedModPath, gameDef, fs)
    : undefined
  if (isCancelled?.() === true) return emptyOutput(generated)

  onPhase?.('discovering')
  const discovered = await discoverMods(rootDir, gameDef, fs)
  const { mods, selfCopy } = dropOurOwnMod(discovered.mods, generatedModFolder)
  if (isCancelled?.() === true) return emptyOutput(generated, selfCopy)

  onPhase?.('building-coverage', 0, mods.length)
  const coverage = await buildCoverage(mods, gameDef, sourceLanguage, fs, {
    ...(isCancelled !== undefined && { isCancelled }),
    ...(onPhase !== undefined && {
      onProgress: (read, total) => onPhase('building-coverage', read, total)
    })
  })
  if (isCancelled?.() === true) return emptyOutput(generated, selfCopy)

  onPhase?.('planning', 0, mods.length)
  const running: ScanRunningTotals = {
    files: 0,
    missingFiles: 0,
    missingLines: 0,
    withoutLocalisation: 0,
    otherSpelling: 0,
    errors: 0,
    warnings: 0
  }
  let done = 0
  const results = await mapWithConcurrency(mods, MOD_CONCURRENCY, async mod => {
    if (isCancelled?.() === true) return undefined
    const coverageForMod: Coverage | undefined = coverage.get(mod.id)
    const result = await scanMod(
      mod,
      {
        gameDef,
        sourceLanguage,
        targetLanguages,
        packed: false,
        detail,
        ...(targetContent !== undefined && { targetContent }),
        ...(coverageForMod !== undefined && { coverage: coverageForMod }),
        ...(generated !== undefined && { generated }),
        ...(memory !== undefined && { memory })
      },
      fs,
      countLines
    )
    done++
    accumulate(running, result.scanned)
    if (onDiagnostic) reportMod(result.scanned, onDiagnostic)
    onProgress?.(done, mods.length, result.scanned.name, { ...running })
    onPhase?.('planning', done, mods.length)
    return result
  })

  const present = results.filter(result => result !== undefined)
  const scanned = present.map(result => result.scanned)
  const totals = scanned.reduce<ScanTotals>(
    (acc, mod) => ({
      mods: acc.mods + 1,
      missingFiles: acc.missingFiles + mod.missingFiles,
      missingLines: acc.missingLines + mod.missingLines,
      withoutLocalisation: acc.withoutLocalisation + (mod.localisationFiles === 0 ? 1 : 0),
      otherSpelling: acc.otherSpelling + (mod.otherSpelling ? 1 : 0),
      coveredKeys: acc.coveredKeys + sumByLanguage(mod.coveredKeys),
      englishKeys: acc.englishKeys + sumByLanguage(mod.englishKeys),
      keptKeys: acc.keptKeys + sumByLanguage(mod.keptKeys),
      shadowedKeys: acc.shadowedKeys + sumByLanguage(mod.shadowedKeys),
    }),
    { ...EMPTY_TOTALS }
  )

  const sorted = scanned.toSorted(
    (a, b) => b.missingFiles - a.missingFiles || a.name.localeCompare(b.name)
  )

  return {
    mods: sorted,
    totals,
    ...(selfCopy !== undefined && { selfCopy }),
    ...(generated !== undefined && { generatedMod: summariseGeneratedMod(generated, scanned) }),
    ...(detail && { keyStates: present.flatMap(result => result.keyStates) })
  }
}

function emptyOutput(generated: GeneratedMod | undefined, selfCopy?: string): ScanOutput {
  const scanned: ScannedMod[] = []
  return {
    mods: scanned,
    totals: { ...EMPTY_TOTALS },
    ...(selfCopy !== undefined && { selfCopy }),
    ...(generated !== undefined && { generatedMod: summariseGeneratedMod(generated, scanned) })
  }
}
