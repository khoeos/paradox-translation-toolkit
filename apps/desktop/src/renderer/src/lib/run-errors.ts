import { LOCALISATION_DIRS } from './format-path.js'

export type RunErrorCategory = 'blocked' | 'header' | 'unterminated' | 'other'

export interface ParsedModError {
  category: RunErrorCategory
  languageFolder: string | undefined
  file: string
  location: string
  message: string
  sourceFile?: string
  detail?: string
}

export interface RunErrorCategorySummary {
  category: RunErrorCategory
  count: number
  languages: { name: string; count: number }[]
}

export interface ReportMod {
  id: string
  name: string
  created: number
  failed: number
  errors: readonly string[]
}

export type ModFilter = 'all' | 'issues' | 'failed' | 'clean'

const BLOCKED_PATTERN = /^Parse failed for/
const HEADER_PATTERN = /No `l_<language>:` header/
const UNTERMINATED_PATTERN = /never closed/
const BLOCKED_DETAIL_PATTERN = /^Parse failed for (.+?):\s*\d+:\d+\s*\[[^\]]+\]\s*(.*)$/
const OVERRIDE_SUBDIRS: readonly string[] = ['replace']

const SEPARATOR = ' : '
const TOP_LANGUAGES_LIMIT = 5

const splitLocation = (location: string): string[] =>
  location.split(/[/\\]/).filter(segment => segment.length > 0)

const stripTrailingLine = (segment: string): string => segment.replace(/:\d+$/, '')

const buildFile = (location: string): string => {
  const segments = splitLocation(location).slice(-2)
  const last = segments[segments.length - 1]
  if (last === undefined) return ''
  return [...segments.slice(0, -1), stripTrailingLine(last)].join('/')
}

const getLanguageFolder = (location: string): string | undefined => {
  const segments = splitLocation(location).map(segment => segment.toLowerCase())
  const locIndex = segments.findLastIndex(segment => LOCALISATION_DIRS.has(segment))
  if (locIndex === -1) return undefined

  const rest = segments.slice(locIndex + 1)
  const offset = rest.findIndex(segment => !OVERRIDE_SUBDIRS.some(name => name === segment))
  if (offset === -1 || offset >= rest.length - 1) return undefined
  return rest[offset]
}

const categorize = (message: string): RunErrorCategory => {
  if (BLOCKED_PATTERN.test(message)) return 'blocked'
  if (HEADER_PATTERN.test(message)) return 'header'
  if (UNTERMINATED_PATTERN.test(message)) return 'unterminated'
  return 'other'
}

export const parseModError = (raw: string): ParsedModError => {
  const separatorIndex = raw.indexOf(SEPARATOR)
  const location = separatorIndex === -1 ? '' : raw.slice(0, separatorIndex)
  const message = separatorIndex === -1 ? raw : raw.slice(separatorIndex + SEPARATOR.length)
  const category = categorize(message)
  const languageFolder = getLanguageFolder(location)
  const file = buildFile(location)

  if (category === 'blocked') {
    const detailMatch = BLOCKED_DETAIL_PATTERN.exec(message)
    if (detailMatch) {
      const [, sourceFile, detail] = detailMatch
      if (sourceFile !== undefined && detail !== undefined) {
        return { category, languageFolder, file, location, message, sourceFile, detail }
      }
    }
  }

  return { category, languageFolder, file, location, message }
}

export const parseModErrors = (errors: readonly string[]): ParsedModError[] =>
  errors.map(parseModError)

const CATEGORY_ORDER: readonly RunErrorCategory[] = ['blocked', 'header', 'unterminated', 'other']

export const getErrorCategorySummaries = (
  mods: readonly ReportMod[]
): RunErrorCategorySummary[] => {
  const byCategory = new Map<RunErrorCategory, Map<string, number>>()
  for (const category of CATEGORY_ORDER) byCategory.set(category, new Map())

  const counts: Record<RunErrorCategory, number> = {
    blocked: 0,
    header: 0,
    unterminated: 0,
    other: 0
  }

  for (const mod of mods) {
    for (const raw of mod.errors) {
      const parsed = parseModError(raw)
      counts[parsed.category] += 1
      const languageName = parsed.languageFolder ?? ''
      const languages = byCategory.get(parsed.category)
      if (languages) languages.set(languageName, (languages.get(languageName) ?? 0) + 1)
    }
  }

  return CATEGORY_ORDER.map(category => {
    const languages = [...(byCategory.get(category) ?? new Map())]
      .map(([name, count]) => ({ name, count }))
      .toSorted((a, b) => b.count - a.count)
      .slice(0, TOP_LANGUAGES_LIMIT)
    return { category, count: counts[category], languages }
  })
}

export const getReadErrorsByLanguageFolder = (
  mods: readonly ReportMod[]
): { name: string; count: number; pct: number }[] => {
  const counts = new Map<string, number>()
  let total = 0
  for (const mod of mods) {
    for (const raw of mod.errors) {
      const parsed = parseModError(raw)
      const name = parsed.languageFolder ?? ''
      counts.set(name, (counts.get(name) ?? 0) + 1)
      total += 1
    }
  }

  return [...counts]
    .map(([name, count]) => ({ name, count, pct: total === 0 ? 0 : (count / total) * 100 }))
    .toSorted((a, b) => b.count - a.count)
}

const matchesFilter = (mod: ReportMod, filter: ModFilter): boolean => {
  switch (filter) {
    case 'all':
      return true
    case 'issues':
      return mod.errors.length > 0 || mod.failed > 0
    case 'failed':
      return mod.failed > 0
    case 'clean':
      return mod.errors.length === 0 && mod.failed === 0
  }
}

const matchesCategory = (mod: ReportMod, category: RunErrorCategory | null): boolean => {
  if (category === null) return true
  return mod.errors.some(raw => parseModError(raw).category === category)
}

const matchesSearch = (mod: ReportMod, search: string): boolean => {
  const query = search.trim().toLowerCase()
  if (query === '') return true
  if (mod.name.toLowerCase().includes(query)) return true
  if (mod.id.toLowerCase().includes(query)) return true
  return mod.errors.some(raw => parseModError(raw).file.toLowerCase().includes(query))
}

export const isFilterCompatibleWithCategory = (
  filter: ModFilter,
  category: RunErrorCategory | null
): boolean => category === null || filter !== 'clean'

export const filterReportMods = (
  mods: readonly ReportMod[],
  filter: ModFilter,
  category: RunErrorCategory | null,
  search: string
): ReportMod[] =>
  mods.filter(
    mod =>
      matchesFilter(mod, filter) && matchesCategory(mod, category) && matchesSearch(mod, search)
  )

export const sortReportMods = (mods: readonly ReportMod[]): ReportMod[] =>
  mods.toSorted((a, b) => {
    if (a.failed !== b.failed) return b.failed - a.failed
    if (a.errors.length !== b.errors.length) return b.errors.length - a.errors.length
    return a.name.localeCompare(b.name)
  })
