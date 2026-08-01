import * as fs from 'fs/promises'
import * as path from 'path'

/** Save to disk once this many new translations piled up */
const FLUSH_EVERY = 200

/**
 * Translations already produced, kept between runs.
 *
 * The same English strings appear in dozens of mods and a run over a big collection takes
 * hours, so the memory is what makes a stopped run resumable and a second run cheap.
 * One file per target language, keyed by the source string.
 */
export class TranslationMemory {
  private readonly entries = new Map<string, Map<string, string>>()
  private readonly dirty = new Set<string>()
  private pending = 0

  constructor(private readonly directory: string) {}

  private file(language: string): string {
    return path.join(this.directory, `${language.replace(/[^a-z0-9_-]/gi, '_')}.json`)
  }

  /**
   * Load the memory of a language, once per run
   * @param language - The target language key
   */
  async load(language: string): Promise<void> {
    if (this.entries.has(language)) return
    const map = new Map<string, string>()
    this.entries.set(language, map)

    try {
      const content = await fs.readFile(this.file(language), 'utf8')
      for (const [source, translated] of Object.entries(JSON.parse(content))) {
        if (typeof translated === 'string') map.set(source, translated)
      }
    } catch {
      // No memory yet, or an unreadable one: starting empty is always safe
    }
  }

  /**
   * @param language - The target language key
   * @param source - The source string
   * @returns The known translation, if any
   */
  get(language: string, source: string): string | undefined {
    return this.entries.get(language)?.get(source)
  }

  /**
   * Remember a translation, flushing to disk from time to time
   * @param language - The target language key
   * @param source - The source string
   * @param translated - Its translation
   */
  async set(language: string, source: string, translated: string): Promise<void> {
    this.entries.get(language)?.set(source, translated)
    this.dirty.add(language)
    if (++this.pending >= FLUSH_EVERY) await this.flush()
  }

  /** Write every changed language file, so a cancelled run keeps its progress */
  async flush(): Promise<void> {
    if (this.dirty.size === 0) return
    const languages = [...this.dirty]
    this.dirty.clear()
    this.pending = 0

    await fs.mkdir(this.directory, { recursive: true })
    await Promise.all(
      languages.map(async (language) => {
        const map = this.entries.get(language)
        if (!map) return
        await fs.writeFile(
          this.file(language),
          JSON.stringify(Object.fromEntries(map), null, 0),
          'utf8'
        )
      })
    )
  }
}
