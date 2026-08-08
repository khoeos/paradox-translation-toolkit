/**
 * Scanning a whole mod collection.
 *
 * Ported from PR #4 (e21ee7a, `src/main/translateFn/index.ts` `launchScan`) by
 * Artem Kondrashev.
 */

import type { LanguageCode } from '@ptt/shared-types'

import { mapWithConcurrency } from './concurrency.js'
import { MOD_CONCURRENCY } from './constants.js'
import { buildCoverage } from './coverage.js'
import { discoverMods } from './discover-mods.js'
import { dropOurOwnMod, readGeneratedMod, summariseGeneratedMod } from './generated-mod.js'
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
  /**
   * Where an earlier run wrote its mod, resolved by the caller: only it knows where the game
   * user folder lives.
   */
  generatedModPath?: string
  /** Folder name of the generated mod, so a copy of it inside the scanned folder is dropped. */
  generatedModFolder?: string
  memory?: TranslationMemoryPort
  /** Read the values to estimate the translation workload. */
  countLines?: boolean
  /** Also return the state of every key, which is what the CLI audit shows. */
  detail?: boolean
  /** Called after each mod, so a UI can show real progress rather than a spinner. */
  onProgress?: (done: number, total: number, modName: string) => void
  /** Consulted between mods; the scan stops cleanly rather than being killed. */
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
  shadowedKeys: 0
}

/**
 * Report what every mod of a collection is missing, writing nothing.
 * @param options - See `ScanModsOptions`
 * @param fs - The injected filesystem
 * @returns The scan output, ready to hand to a UI or a report
 */
export async function scanMods(options: ScanModsOptions, fs: FsLike): Promise<ScanOutput> {
  const {
    rootDir,
    gameDef,
    sourceLanguage,
    targetLanguages,
    generatedModPath,
    generatedModFolder,
    memory,
    countLines = false,
    detail = false,
    onProgress,
    isCancelled
  } = options

  // Our own output lives under the game user folder, so without reading it back a second scan
  // reports everything as missing again.
  const generated: GeneratedMod | undefined = generatedModPath
    ? await readGeneratedMod(generatedModPath, gameDef, fs)
    : undefined
  // No `selfCopy` yet: it is the *path* of a copy `dropOurOwnMod` actually found, and nothing
  // has been discovered at this point. Passing the folder name here claimed a copy that does
  // not exist.
  if (isCancelled?.() === true) return emptyOutput(generated)

  const discovered = await discoverMods(rootDir, gameDef, fs)
  const { mods, selfCopy } = dropOurOwnMod(discovered.mods, generatedModFolder)
  if (isCancelled?.() === true) return emptyOutput(generated, selfCopy)

  const coverage = await buildCoverage(mods, gameDef, sourceLanguage, fs)
  if (isCancelled?.() === true) return emptyOutput(generated, selfCopy)

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
        ...(coverageForMod !== undefined && { coverage: coverageForMod }),
        ...(generated !== undefined && { generated }),
        ...(memory !== undefined && { memory })
      },
      fs,
      countLines
    )
    done++
    onProgress?.(done, mods.length, result.scanned.name)
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
      shadowedKeys: acc.shadowedKeys + sumByLanguage(mod.shadowedKeys)
    }),
    { ...EMPTY_TOTALS }
  )

  // Mods needing work first; the rest keeps the list readable.
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
