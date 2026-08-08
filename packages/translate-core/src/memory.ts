import type { FsLike } from '@ptt/converter-core'
import { posixJoin } from '@ptt/converter-core'
import type { LanguageCode } from '@ptt/shared-types'

import { isRecord } from './guards.js'
import type { TranslateConfig } from './types.js'

/** Save to disk once this many new translations piled up. */
export const FLUSH_EVERY = 200

/** Anything a file name cannot carry on every platform becomes an underscore. */
const UNSAFE_NAME_CHARS = /[^a-z0-9_-]/gi

export function safeFileSegment(value: string): string {
  return value.replace(UNSAFE_NAME_CHARS, '_')
}

/**
 * Where the memory of one game and one backend lives, below the app's userData folder.
 *
 * The one definition, because the desktop worker and `apps/cli` only share a memory while they
 * agree on this string byte for byte: they used to derive it separately, so a change on either
 * side would silently have made the CLI stop reading back what the app wrote and pay a
 * translator for the whole collection again.
 * @param userDataPath - The app's userData folder
 * @param gameId - The game, because a CK3 translation is not a Stellaris one (audit finding S-7)
 * @param translate - The backend settings, because changing model must re-evaluate nothing
 * @returns The directory holding one JSON file per target language
 */
export function translationMemoryDir(
  userDataPath: string,
  gameId: string,
  translate?: TranslateConfig
): string {
  const scope = translate ? `${translate.provider}_${translate.model || 'default'}` : 'no-backend'
  return posixJoin(userDataPath, 'translation-memory', gameId, safeFileSegment(scope))
}

/**
 * The translation memory of a run, loaded for every language it will touch.
 * @param userDataPath - The app's userData folder
 * @param gameId - The selected game
 * @param translate - The backend settings, absent for a read-only scan with no backend
 * @param languages - The target languages to load up front
 * @param fs - The injected filesystem
 * @returns The loaded memory
 */
export async function openTranslationMemory(
  userDataPath: string,
  gameId: string,
  translate: TranslateConfig | undefined,
  languages: readonly LanguageCode[],
  fs: FsLike
): Promise<TranslationMemory> {
  const memory = new TranslationMemory(translationMemoryDir(userDataPath, gameId, translate), fs)
  await Promise.all(languages.map(language => memory.load(language)))
  return memory
}

/**
 * Remove every file a `TranslationMemory` could have written below a folder, leaving the rest.
 *
 * Deliberately not `fs.rm(recursive)` on a derived path: audit finding S-16, where an empty
 * `--user-data` turned that into a recursive delete of a cwd-relative folder. It lives here
 * because this class is the only thing that knows which file names it produces, and the rule was
 * previously spelled out again in the desktop service and in the CLI command.
 * @param directory - The folder to clear
 * @param fs - The injected filesystem
 * @returns How many files were removed
 */
export async function clearMemoryFiles(directory: string, fs: FsLike): Promise<number> {
  if (!(await fs.exists(directory))) return 0
  let removed = 0
  for (const entry of await fs.readdir(directory)) {
    const child = posixJoin(directory, entry.name)
    if (entry.isDirectory) {
      removed += await clearMemoryFiles(child, fs)
      continue
    }
    if (entry.isFile && (entry.name.endsWith('.json') || entry.name.endsWith('.json.tmp'))) {
      await fs.unlink(child)
      removed++
    }
  }
  return removed
}

/**
 * Translations already produced, kept between runs.
 *
 * Ported from PR #4 (e21ee7a, `src/main/translate/memory.ts`) by Artem Kondrashev.
 *
 * The same English strings appear in dozens of mods and a run over a big collection takes
 * hours, so the memory is what makes a stopped run resumable and a second run cheap. One file
 * per target language, keyed by the source string.
 *
 * The directory is handed in whole rather than derived here: scoping it per game and per
 * provider is the caller's call (audit finding S-7, where one flat file was shared across every
 * game and every model, so a CK3 translation was served for Stellaris and changing model never
 * re-evaluated anything).
 */
export class TranslationMemory {
  private readonly entries = new Map<LanguageCode, Map<string, string>>()
  private readonly dirty = new Set<LanguageCode>()
  private pending = 0

  constructor(
    private readonly directory: string,
    private readonly fs: FsLike
  ) {}

  file(language: LanguageCode): string {
    return posixJoin(this.directory, `${safeFileSegment(language)}.json`)
  }

  /**
   * Load the memory of a language, once per run.
   * @param language - The target language
   */
  async load(language: LanguageCode): Promise<void> {
    if (this.entries.has(language)) return
    const map = new Map<string, string>()
    this.entries.set(language, map)

    let content: string
    try {
      content = await this.fs.readFile(this.file(language), 'utf-8')
    } catch {
      // No memory yet: starting empty is always safe.
      return
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(content)
    } catch {
      // A truncated file is what a killed run used to leave behind. Starting empty is safe,
      // but silence is not: the caller decides whether to warn.
      return
    }
    if (!isRecord(parsed)) return
    for (const [source, translated] of Object.entries(parsed)) {
      if (typeof translated === 'string') map.set(source, translated)
    }
  }

  /** Whether `load` has run for a language, so a silent no-op `set` is impossible. */
  isLoaded(language: LanguageCode): boolean {
    return this.entries.has(language)
  }

  /**
   * @param language - The target language
   * @param source - The source string
   * @returns The known translation, if any
   */
  get(language: LanguageCode, source: string): string | undefined {
    return this.entries.get(language)?.get(source)
  }

  /**
   * Remember a translation, flushing to disk from time to time.
   * @param language - The target language
   * @param source - The source string
   * @param translated - Its translation
   * @throws When the language was never loaded, which used to drop the write in silence
   */
  async set(language: LanguageCode, source: string, translated: string): Promise<void> {
    const map = this.entries.get(language)
    if (!map) {
      throw new Error(`Translation memory for "${language}" was never loaded`)
    }
    map.set(source, translated)
    this.dirty.add(language)
    if (++this.pending >= FLUSH_EVERY) await this.flush()
  }

  /**
   * Write every changed language file, so a cancelled run keeps its progress.
   *
   * Written to a temporary file and renamed over the target. Audit findings S-8 and S-19: the
   * original rewrote the file in place while the worker could be killed at any moment, and a
   * kill mid-write left a truncated JSON that `load` swallowed, losing the whole language.
   */
  async flush(): Promise<void> {
    if (this.dirty.size === 0) return
    const languages = [...this.dirty]
    this.dirty.clear()
    this.pending = 0

    try {
      await this.fs.mkdir(this.directory, { recursive: true })
      await Promise.all(
        languages.map(async language => {
          const map = this.entries.get(language)
          if (!map) return
          const target = this.file(language)
          const temporary = `${target}.tmp`
          await this.fs.writeFile(temporary, JSON.stringify(Object.fromEntries(map)), 'utf-8')
          await this.fs.rename(temporary, target)
        })
      )
    } catch (err) {
      // Still dirty: clearing the set up front and never putting it back meant one unwritable
      // flush (permissions, disk full) silently dropped every translation of those languages,
      // including the ones the end-of-run flush was meant to save.
      for (const language of languages) this.dirty.add(language)
      throw err
    }
  }

  /**
   * Forget what was learnt, on disk and in memory.
   * @param language - Only that language, or every language when left out
   */
  async clear(language?: LanguageCode): Promise<void> {
    const languages = language ? [language] : [...this.entries.keys()]
    for (const lang of languages) {
      this.entries.delete(lang)
      this.dirty.delete(lang)
      await this.removeIfPresent(this.file(lang))
      await this.removeIfPresent(`${this.file(lang)}.tmp`)
    }
    // Files of languages this instance never loaded, which `clear()` still has to remove.
    if (!language) await clearMemoryFiles(this.directory, this.fs).catch(() => 0)
  }

  private async removeIfPresent(path: string): Promise<void> {
    try {
      await this.fs.unlink(path)
    } catch {
      // Already gone, which is the desired state anyway.
    }
  }
}
