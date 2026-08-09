/**
 * The key-level diff: what is actually missing in a mod, key by key.
 *
 * Ported from PR #4 (e21ee7a, `src/main/translateFn/index.ts` `planMod`) by Artem Kondrashev.
 *
 * Comparing file names was the old behaviour and it was wrong: pointed at a folder holding
 * both an original mod and its separate Russian localisation mod, the tool did not see the
 * localisation mod (it ships no English files), decided the original was missing Russian, and
 * generated files holding English text tagged `l_russian`. The generated container loads last,
 * so it overwrote a real translation with English.
 */

import { isTranslatable } from '@ptt/parser'

import { readDescriptor } from './descriptor.js'
import { readModKeys } from './mod-keys.js'
import { getModNamespace, withPartialSuffix } from './naming.js'
import { pathKey, posixBasename, posixRejoin, posixSplit } from './path.js'
import { rewriteLanguageInPath } from './plan.js'
import type {
  CreationJob,
  FsLike,
  KeyPlanOptions,
  KeyReport,
  KeyState,
  LocalisationEntry,
  LocalisationFilePath,
  ModFolder,
  ModPlan
} from './types.js'

/**
 * Whether a generated value is a real translation or the source string copied verbatim.
 * @param generated - The value found in the generated mod
 * @param source - The value in the source language
 * @returns True when the translator produced nothing for this key
 */
export function isUntranslated(generated: string, source: string): boolean {
  return generated.trim() === source.trim()
}

/**
 * Path of a target file inside the generated translation mod, relative to its language folder.
 * The source language folder is dropped, everything else keeps the source mod layout.
 * @param file - The described source file
 * @param targetPath - The already computed target path
 * @param sourceToken - The source language file token
 * @returns The path segments below the target language folder
 */
export function getTranslationModPath(
  file: LocalisationFilePath,
  targetPath: string,
  sourceToken: string
): string[] {
  const folders = file.rest.slice(0, -1)
  const languageIndex = folders.findIndex(segment => segment.toLowerCase() === sourceToken)
  const kept =
    languageIndex === -1
      ? folders
      : [...folders.slice(0, languageIndex), ...folders.slice(languageIndex + 1)]

  return [...kept, posixBasename(targetPath)]
}

/** Source values of the keys nothing has translated yet. */
export function pendingValues(job: CreationJob): string[] {
  return [...job.keys].filter(([key]) => !job.known.has(key)).map(([, value]) => value)
}

/** Keys of a job that still need work; the rest is only carried over. */
export function pendingCount(job: CreationJob): number {
  return job.keys.size - job.known.size
}

/**
 * Count the lines a translator would have to handle.
 * @param jobs - The planned files, per language
 * @returns The number of translatable lines
 */
export function countTranslatableLines(jobs: ModPlan['jobs']): number {
  let total = 0
  for (const languageJobs of Object.values(jobs)) {
    for (const job of languageJobs ?? []) {
      // Only what still needs a translator: the rest is copied or carried over for free.
      for (const value of pendingValues(job)) if (isTranslatable(value)) total++
    }
  }
  return total
}

/**
 * Work out what is missing in a mod, writing nothing.
 * @param mod - The mod folder
 * @param options - How to plan, see `KeyPlanOptions`
 * @param fs - The injected filesystem
 * @returns The plan for that mod
 */
export async function planMod(
  mod: ModFolder,
  options: KeyPlanOptions,
  fs: FsLike
): Promise<ModPlan> {
  const { gameDef, sourceLanguage, targetLanguages, packed, coverage, generated, memory, detail } =
    options

  const descriptor = await readDescriptor(mod.path, fs)
  const name = descriptor.name ?? mod.id
  const plan: ModPlan = {
    name,
    namespace: getModNamespace(mod.id, name),
    ...(descriptor.supportedVersion !== undefined && {
      supportedVersion: descriptor.supportedVersion
    }),
    otherSpelling: false,
    localisationFiles: 0,
    sourceFiles: 0,
    sourceKeys: 0,
    jobs: {},
    covered: {},
    english: {},
    kept: {},
    shadowed: {},
    keyStates: [],
    errors: []
  }

  const modKeys = await readModKeys(mod.path, gameDef, fs)
  plan.otherSpelling = modKeys.otherSpelling
  plan.errors = modKeys.diagnostics
  plan.localisationFiles = modKeys.files
  if (modKeys.files === 0) return plan

  const sourceEntries = modKeys.byLanguage.get(sourceLanguage)
  if (!sourceEntries || sourceEntries.size === 0) return plan
  plan.sourceFiles = new Set([...sourceEntries.values()].map(entry => entry.file)).size
  plan.sourceKeys = sourceEntries.size

  const sourceToken = gameDef.languageFileToken[sourceLanguage]
  if (sourceToken === undefined) return plan

  const existingFiles = new Set<string>()
  for (const entries of modKeys.byLanguage.values()) {
    for (const entry of entries.values()) existingFiles.add(pathKey(entry.file))
  }

  const generatedForMod = generated?.byNamespace.get(plan.namespace)

  for (const language of targetLanguages) {
    if (language === sourceLanguage) continue
    const targetToken = gameDef.languageFileToken[language]
    if (targetToken === undefined) continue

    // A key counts as done when the mod itself translated it, or when a localisation mod
    // depending on this one did. Generating it again would shadow a real translation.
    const own = modKeys.byLanguage.get(language)
    const patched = coverage?.byLanguage.get(language)
    const ours = generatedForMod?.get(language)

    let covered = 0
    let english = 0
    let kept = 0
    let shadowed = 0

    const byFile = new Map<
      string,
      { entry: LocalisationEntry; keys: Map<string, string>; known: Map<string, string> }
    >()

    const record = (
      entry: LocalisationEntry,
      state: KeyState,
      provider?: string,
      shadowedByUs?: boolean
    ): void => {
      if (!detail) return
      const report: KeyReport = {
        modId: mod.id,
        modName: plan.name,
        language,
        key: entry.key,
        file: entry.file,
        source: entry.value,
        state,
        markupOnly: !isTranslatable(entry.value),
        ...(provider !== undefined && { provider }),
        ...(shadowedByUs !== undefined && { shadowed: shadowedByUs })
      }
      plan.keyStates.push(report)
    }

    for (const [key, entry] of sourceEntries) {
      // Somebody else's translation: our file must not hold this key at all. When it does, our
      // mod loads last and hides their work until the next run drops the key.
      const isOwn = own?.has(key) ?? false
      if (isOwn || (patched?.has(key) ?? false)) {
        covered++
        const hidden = ours?.has(key) ?? false
        if (hidden) shadowed++
        record(
          entry,
          isOwn ? 'own' : 'patch',
          isOwn ? plan.name : coverage?.sources.join(', '),
          hidden
        )
        continue
      }

      let group = byFile.get(entry.file)
      if (!group) {
        group = { entry, keys: new Map(), known: new Map() }
        byFile.set(entry.file, group)
      }
      group.keys.set(key, entry.value)

      const mine = ours?.get(key)
      if (!mine) {
        record(entry, 'missing')
        continue
      }

      // A value we copied verbatim is not a translation. Markup and numbers are copied on
      // purpose and never sent anywhere, so only real text left as-is is in question.
      const verbatim = isUntranslated(mine.value, entry.value) && isTranslatable(entry.value)
      // The memory settles it: an entry holding the source text means the backend answered and
      // answered with that. A proper name it chose to keep is worth no retry, only the same
      // bill. No entry at all means nothing ever came back for this string.
      if (verbatim && memory?.get(language, entry.value) !== entry.value) {
        english++
        record(entry, 'english', mine.file)
        continue
      }

      covered++
      group.known.set(key, mine.value)
      if (verbatim) {
        kept++
        record(entry, 'kept', mine.file)
      } else {
        record(entry, 'generated', mine.file)
      }
    }

    plan.covered[language] = covered
    plan.english[language] = english
    plan.kept[language] = kept
    plan.shadowed[language] = shadowed

    const seen = new Set<string>()
    const languageJobs: CreationJob[] = []

    for (const { entry, keys, known } of byFile.values()) {
      let target = targetPathFor(entry.described, sourceToken, targetToken)
      if (pathKey(target) === pathKey(entry.file)) continue
      // The natural name is taken by an existing translation: never rewrite it, sit beside it.
      if (existingFiles.has(pathKey(target))) target = withPartialSuffix(target)
      const key = pathKey(target)
      if (seen.has(key)) continue
      seen.add(key)

      languageJobs.push({
        source: entry.file,
        target,
        packed: packed ? getTranslationModPath(entry.described, target, sourceToken) : [],
        keys,
        known
      })
    }

    if (languageJobs.length > 0) plan.jobs[language] = languageJobs
  }

  return plan
}

/**
 * Build the path a file would have in the target language.
 *
 * Only the segments below the localisation folder are rewritten, so a mod folder named after a
 * language (`english_names_fix`, ...) is never mangled.
 */
function targetPathFor(
  file: LocalisationFilePath,
  sourceToken: string,
  targetToken: string
): string {
  const normalized = file.path.replaceAll('\\', '/')
  const segments = posixSplit(normalized)
  const head = segments.slice(0, file.locIndex + 1)
  const tail = posixSplit(rewriteLanguageInPath(file.rest.join('/'), sourceToken, targetToken))
  return posixRejoin(normalized, [...head, ...tail])
}
