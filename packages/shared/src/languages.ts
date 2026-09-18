import type { ConvertMode, TargetContent } from './index.js'

export const LANGUAGE_CODES = [
  'en',
  'fr',
  'de',
  'es',
  'pl',
  'pt-BR',
  'ru',
  'zh-Hans',
  'ko',
  'ja',
  'tr'
] as const

export type LanguageCode = (typeof LANGUAGE_CODES)[number]

export const isLanguageCode = (v: string): v is LanguageCode =>
  LANGUAGE_CODES.some(code => code === v)

export const FILE_TOKEN_MAX = 32

const FILE_TOKEN_RE = /^[a-z_]+$/

const FILE_TOKEN_MARKER_RE = /(^|_)l_/

export const normalizeFileToken = (raw: string): string => raw.trim().toLowerCase()

export const isFileToken = (v: string): boolean =>
  v.length <= FILE_TOKEN_MAX && FILE_TOKEN_RE.test(v) && !FILE_TOKEN_MARKER_RE.test(v)

export interface TranslationTarget {
  language: string
  fileToken: string
}

export type GameTokens = Partial<Record<LanguageCode, string>>

export const gameTokenOwner = (fileToken: string, tokens: GameTokens): LanguageCode | undefined =>
  LANGUAGE_CODES.find(language => tokens[language] === fileToken)

export const usesOwnToken = (t: TranslationTarget, tokens: GameTokens): boolean =>
  isLanguageCode(t.language) && tokens[t.language] === t.fileToken

export const shadowedLanguageOf = (
  t: TranslationTarget,
  tokens: GameTokens
): LanguageCode | undefined => {
  const owner = gameTokenOwner(t.fileToken, tokens)
  return owner !== undefined && owner !== t.language ? owner : undefined
}

export const builtInTargetFor = (
  language: LanguageCode,
  tokens: GameTokens
): TranslationTarget | undefined => {
  const fileToken = tokens[language]
  return fileToken === undefined ? undefined : { language, fileToken }
}

export const isGameToken = (fileToken: string, tokens: GameTokens): boolean =>
  gameTokenOwner(fileToken, tokens) !== undefined

export const LANGUAGE_LABEL_MAX = 64

const LANGUAGE_LABEL_FORBIDDEN = /[:,\p{C}]/u

export const isLanguageLabel = (v: string): boolean =>
  v.length > 0 &&
  v.length <= LANGUAGE_LABEL_MAX &&
  v === v.trim() &&
  !LANGUAGE_LABEL_FORBIDDEN.test(v)

export const LANGUAGE_DISPLAY_NAMES: Record<LanguageCode, string> = {
  en: 'English',
  fr: 'French',
  de: 'German',
  es: 'Spanish',
  pl: 'Polish',
  'pt-BR': 'Brazilian Portuguese',
  ru: 'Russian',
  'zh-Hans': 'Simplified Chinese',
  ko: 'Korean',
  ja: 'Japanese',
  tr: 'Turkish'
}

const LANGUAGE_TOKEN_ALIASES: ReadonlyMap<string, LanguageCode> = new Map<string, LanguageCode>([
  ['braz_por', 'pt-BR'],
  ['simp_chinese', 'zh-Hans']
])

export const getTargetLanguageCode = (raw: string): LanguageCode | undefined => {
  const needle = raw.trim().toLowerCase()
  if (needle.length === 0) return undefined
  return (
    LANGUAGE_CODES.find(code => code.toLowerCase() === needle) ??
    LANGUAGE_CODES.find(code => LANGUAGE_DISPLAY_NAMES[code].toLowerCase() === needle) ??
    LANGUAGE_TOKEN_ALIASES.get(needle)
  )
}

export const normalizeTargetLanguage = (raw: string): string =>
  getTargetLanguageCode(raw) ?? raw.trim()

export const normalizeTargets = (targets: readonly TranslationTarget[]): TranslationTarget[] =>
  targets.map(t => ({ ...t, language: normalizeTargetLanguage(t.language) }))

export const uniqueTargetLanguages = (targets: readonly TranslationTarget[]): string[] => [
  ...new Set(targets.map(t => t.language))
]

export const targetsFromLanguages = (
  languages: readonly string[],
  tokens: GameTokens
): TranslationTarget[] =>
  languages.flatMap(language =>
    isLanguageCode(language) ? (builtInTargetFor(language, tokens) ?? []) : []
  )

export const getLanguageDisplayName = (language: string): string => {
  const code = getTargetLanguageCode(language)
  return code === undefined ? language : LANGUAGE_DISPLAY_NAMES[code]
}

export const getTargetLanguageKey = (language: string): string =>
  getTargetLanguageCode(language) ?? normalizeTargetLanguage(language).toLowerCase()

export const findUnrecognizedTarget = (
  targets: readonly TranslationTarget[]
): TranslationTarget | undefined => targets.find(target => !isLanguageCode(target.language))

export const findNothingToWriteTarget = (
  targets: readonly TranslationTarget[],
  tokens: GameTokens,
  sourceLanguage: LanguageCode,
  mode: ConvertMode,
  targetContent: TargetContent
): TranslationTarget | undefined => {
  if (mode !== 'add-to-current' || targetContent !== 'missing-keys') return undefined
  const sourceToken = tokens[sourceLanguage]
  return targets.find(target => target.fileToken === sourceToken)
}

export type TargetListProblem =
  | { code: 'empty' }
  | { code: 'invalid-language'; index: number }
  | { code: 'invalid-token'; index: number }
  | { code: 'unknown-token'; index: number; fileToken: string }
  | { code: 'duplicate-language'; index: number; language: string }
  | { code: 'duplicate-token'; index: number; fileToken: string }
  | { code: 'rapidapi-unsupported'; index: number; language: string }
  | { code: 'nothing-to-write'; index: number; fileToken: string }

export const findTargetListProblem = (
  targets: readonly TranslationTarget[],
  tokens: GameTokens
): TargetListProblem | undefined => {
  if (targets.length === 0) {
    return { code: 'empty' }
  }

  const seenLanguages = new Set<string>()
  const seenTokens = new Set<string>()

  for (const [index, target] of targets.entries()) {
    if (!isLanguageLabel(target.language)) {
      return { code: 'invalid-language', index }
    }
    if (!isFileToken(target.fileToken)) {
      return { code: 'invalid-token', index }
    }
    if (!isGameToken(target.fileToken, tokens)) {
      return { code: 'unknown-token', index, fileToken: target.fileToken }
    }

    const languageKey = getTargetLanguageKey(target.language)
    if (seenLanguages.has(languageKey)) {
      return { code: 'duplicate-language', index, language: target.language }
    }
    if (seenTokens.has(target.fileToken)) {
      return { code: 'duplicate-token', index, fileToken: target.fileToken }
    }
    seenLanguages.add(languageKey)
    seenTokens.add(target.fileToken)
  }

  return undefined
}

export interface TargetCheckContext {
  sourceLanguage: LanguageCode
  mode: ConvertMode
  targetContent: TargetContent
  provider?: string | undefined
}

export const findTargetListIssue = (
  targets: readonly TranslationTarget[],
  tokens: GameTokens,
  context: TargetCheckContext
): TargetListProblem | undefined => {
  const problem = findTargetListProblem(targets, tokens)
  if (problem !== undefined) return problem

  if (context.provider === 'rapidapi') {
    const unsupported = findUnrecognizedTarget(targets)
    if (unsupported !== undefined) {
      return {
        code: 'rapidapi-unsupported',
        index: targets.indexOf(unsupported),
        language: unsupported.language
      }
    }
  }

  const nothingToWrite = findNothingToWriteTarget(
    targets,
    tokens,
    context.sourceLanguage,
    context.mode,
    context.targetContent
  )
  if (nothingToWrite !== undefined) {
    return {
      code: 'nothing-to-write',
      index: targets.indexOf(nothingToWrite),
      fileToken: nothingToWrite.fileToken
    }
  }

  return undefined
}

export const describeTargetListProblem = (
  problem: TargetListProblem,
  targets: readonly TranslationTarget[],
  game: { displayName: string; languageFileToken: GameTokens }
): string => {
  switch (problem.code) {
    case 'empty':
      return 'No target given'
    case 'invalid-language':
      return `Invalid target language "${targets[problem.index]?.language}"`
    case 'invalid-token': {
      const target = targets[problem.index]
      return `Invalid file token "${target?.fileToken}" for "${target?.language}"`
    }
    case 'unknown-token':
      return (
        `${game.displayName} writes no l_${problem.fileToken}: expected one of ` +
        Object.values(game.languageFileToken).join(', ')
      )
    case 'duplicate-language':
      return `Target language "${problem.language}" is given more than once`
    case 'duplicate-token':
      return `Target file token "${problem.fileToken}" is given more than once`
    case 'rapidapi-unsupported':
      return (
        `The RapidAPI provider cannot translate into "${problem.language}": it only supports ` +
        `${LANGUAGE_CODES.join(', ')}. Pick a built-in language, or use the OpenAI or Ollama provider.`
      )
    case 'nothing-to-write':
      return (
        `l_${problem.fileToken} is already how this mod is written: with "Only missing keys" ` +
        'there is nothing to add. Pick "Complete file", or use "Create a translation mod".'
      )
  }
}
