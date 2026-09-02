import type { FsLike } from '@ptt/converter'
import { posixJoin } from '@ptt/converter'
import type { LanguageCode } from '@ptt/shared'

import { isRecord } from './guards.js'
import type { TranslateConfig } from './types.js'

export const FLUSH_EVERY = 200

const UNSAFE_NAME_CHARS = /[^a-z0-9_-]/gi

export function safeFileSegment(value: string): string {
  return value.replace(UNSAFE_NAME_CHARS, '_')
}

export function translationMemoryDir(
  userDataPath: string,
  gameId: string,
  translate?: TranslateConfig
): string {
  const scope = translate ? `${translate.provider}_${translate.model || 'default'}` : 'no-backend'
  return posixJoin(userDataPath, 'translation-memory', gameId, safeFileSegment(scope))
}

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

  async load(language: LanguageCode): Promise<void> {
    if (this.entries.has(language)) return
    const map = new Map<string, string>()
    this.entries.set(language, map)

    let content: string
    try {
      content = await this.fs.readFile(this.file(language), 'utf-8')
    } catch {
      return
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(content)
    } catch {
      return
    }
    if (!isRecord(parsed)) return
    for (const [source, translated] of Object.entries(parsed)) {
      if (typeof translated === 'string') map.set(source, translated)
    }
  }

  isLoaded(language: LanguageCode): boolean {
    return this.entries.has(language)
  }

  get(language: LanguageCode, source: string): string | undefined {
    return this.entries.get(language)?.get(source)
  }

  async set(language: LanguageCode, source: string, translated: string): Promise<void> {
    const map = this.entries.get(language)
    if (!map) {
      throw new Error(`Translation memory for "${language}" was never loaded`)
    }
    map.set(source, translated)
    this.dirty.add(language)
    if (++this.pending >= FLUSH_EVERY) await this.flush()
  }

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
      for (const language of languages) this.dirty.add(language)
      throw err
    }
  }

  async clear(language?: LanguageCode): Promise<void> {
    const languages = language ? [language] : [...this.entries.keys()]
    for (const lang of languages) {
      this.entries.delete(lang)
      this.dirty.delete(lang)
      await this.removeIfPresent(this.file(lang))
      await this.removeIfPresent(`${this.file(lang)}.tmp`)
    }
    if (!language) await clearMemoryFiles(this.directory, this.fs).catch(() => 0)
  }

  private async removeIfPresent(path: string): Promise<void> {
    try {
      await this.fs.unlink(path)
    } catch {}
  }
}
