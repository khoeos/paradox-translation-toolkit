import { DEFAULT_MOD_NAME, resolveTargets } from '@ptt/converter'

import { getAllGameIds, getGame } from '@ptt/games'
import { runReportsDir } from '@ptt/report'
import type { GameDefinition } from '@ptt/shared'
import {
  CONVERT_MODES,
  LANGUAGE_CODES,
  LanguageCodeSchema,

  TARGET_CONTENTS,
  describeTargetListProblem,
  findTargetListIssue,
  findTargetListProblem,
  isFileToken,
  isGameToken,
  isLanguageCode,
  isLanguageLabel,
  normalizeFileToken,
  normalizeTargetLanguage
} from '@ptt/shared'
import type {
  ConvertMode,
  LanguageCode,
  TargetContent,
  TargetListProblem,
  TranslationTarget
} from '@ptt/shared'

import type { TranslateConfig } from '@ptt/translate'
import { PROVIDER_DEFAULTS, TRANSLATE_DEFAULTS, TRANSLATE_PROVIDERS } from '@ptt/translate'

import type { Args } from './args.js'
import { asBool, asList, asNumber, asString } from './coerce.js'
import { readConfig } from './config.js'
import { resolveDocuments, resolveUserData } from './user-data.js'

const MODE_ALIASES: Record<string, ConvertMode> = {
  mod: 'create-translation-mod',
  add: 'add-to-current',
  extract: 'extract-to-folder'
}

const TARGET_CONTENT_ALIASES: Record<string, TargetContent> = {
  missing: 'missing-keys',
  complete: 'complete-file',
  regenerate: 'regenerate-file'
}

const NEEDS_PATH = new Set(['scan', 'audit', 'convert'])

const DEFAULT_ROWS = 30

export interface CliOptions {
  command: string
  rootDir: string
  game: GameDefinition
  sourceLanguage: LanguageCode
  targets: TranslationTarget[]
  mode: ConvertMode
  targetContent: TargetContent
  retranslateOwnKeys: boolean
  outputDir?: string
  modName: string
  selectedMods?: string[]
  documentsPath: string
  userDataPath: string
  reportsDir: string
  translate?: TranslateConfig
  modFilter?: string
  limit: number
  jsonOut?: string
  csvOut?: string
}

export async function buildOptions(args: Args): Promise<CliOptions> {
  const config = readConfig(asString(args.flags.config))
  const flags = { ...config, ...args.flags }

  const gameId = asString(flags.game) ?? 'ck3'
  const game = getGame(gameId)
  if (!game) {
    throw new Error(`Unknown game "${gameId}", expected one of ${getAllGameIds().join(', ')}`)
  }

  const rootDir = asString(flags.path)
  if (rootDir === undefined && NEEDS_PATH.has(args.command)) {
    throw new Error('--path is required: the folder holding the mods to scan')
  }

  const modeAlias = asString(flags.mode) ?? 'mod'
  const mode = MODE_ALIASES[modeAlias] ?? (isConvertMode(modeAlias) ? modeAlias : undefined)
  if (mode === undefined) {
    throw new Error(
      `Unknown --mode "${modeAlias}", expected one of ${Object.keys(MODE_ALIASES).join(', ')}`
    )
  }

  const contentAlias = asString(flags.content) ?? 'missing'
  const targetContent =
    TARGET_CONTENT_ALIASES[contentAlias] ??
    (isTargetContent(contentAlias) ? contentAlias : undefined)
  if (targetContent === undefined) {
    throw new Error(
      `Unknown --content "${contentAlias}", expected one of ${Object.keys(TARGET_CONTENT_ALIASES).join(', ')}`
    )
  }

  const sourceLanguage = parseSourceLanguage(game, asString(flags.from) ?? 'en')
  const targets = parseTargets(game, asString(flags.to) ?? 'ru')

  const dropped = describeDroppedTargets(game, sourceLanguage, targets)
  if (dropped) {
    throw new Error(`Every --to target was dropped, so the run would write nothing: ${dropped}`)
  }

  const userDataPath = resolveUserData(asString(flags['user-data']))

  const documentsPath = await resolveDocuments(asString(flags.documents))
  const outputDir = asString(flags.out)
  const modFilter = asString(flags.mod)
  const jsonOut = asString(flags.json)
  const csvOut = asString(flags.csv)
  const selectedMods = asList(flags.mods)
  const translate = buildTranslate(flags, game)

  const issue = findTargetListIssue(targets, game.languageFileToken, {
    sourceLanguage,
    mode,
    targetContent,
    ...(translate !== undefined && { provider: translate.provider })
  })
  if (issue) throw new Error(describeTargetListProblem(issue, targets, game))

  return {
    command: args.command,
    rootDir: rootDir ?? '',
    game,
    sourceLanguage,
    targets,
    mode,
    targetContent,
    retranslateOwnKeys: asBool(flags['retranslate-own-keys']),
    modName: asString(flags['mod-name']) ?? DEFAULT_MOD_NAME,
    documentsPath,
    userDataPath,
    reportsDir: runReportsDir(userDataPath),

    limit: asNumber(flags.limit, DEFAULT_ROWS),
    ...(outputDir !== undefined && { outputDir }),
    ...(selectedMods !== undefined && { selectedMods }),
    ...(modFilter !== undefined && { modFilter }),
    ...(jsonOut !== undefined && { jsonOut }),
    ...(csvOut !== undefined && { csvOut }),
    ...(translate !== undefined && { translate })
  }
}

function buildTranslate(
  flags: Record<string, string | boolean | number | undefined>,
  game: GameDefinition
): TranslateConfig | undefined {
  if (!asBool(flags.translate)) return undefined

  const providerName = asString(flags.provider) ?? TRANSLATE_DEFAULTS.provider
  if (!isProvider(providerName)) {
    throw new Error(
      `Unknown --provider "${providerName}", expected one of ${TRANSLATE_PROVIDERS.join(', ')}`
    )
  }
  const defaults = PROVIDER_DEFAULTS[providerName]

  const apiKey = asString(flags['api-key']) ?? process.env.PTT_API_KEY
  const gamePath = asString(flags['game-path'])

  return {
    enabled: true,
    provider: providerName,
    baseUrl: asString(flags['base-url']) ?? defaults.baseUrl,
    model: asString(flags.model) ?? defaults.model,
    batchSize: asNumber(flags.batch, TRANSLATE_DEFAULTS.batchSize),
    concurrency: asNumber(flags.concurrency, TRANSLATE_DEFAULTS.concurrency),
    retries: asNumber(flags.retries, TRANSLATE_DEFAULTS.retries),
    timeout: asNumber(flags.timeout, TRANSLATE_DEFAULTS.timeout),
    domain: game.domain,
    ...(apiKey !== undefined && { apiKey }),
    ...(gamePath !== undefined && { gamePath })
  }
}

export function parseSourceLanguage(game: GameDefinition, spec: string): LanguageCode {
  const code = spec.trim()
  if (code.includes(':')) {
    throw new Error(
      '--from takes a language only: the source language is always one the game ships, no token to pick'
    )
  }
  const validated = LanguageCodeSchema.safeParse(code)
  if (!validated.success) {
    throw new Error(`Unknown language "${code}", expected one of ${LANGUAGE_CODES.join(', ')}`)
  }
  if (game.languageFileToken[validated.data] === undefined) {
    throw new Error(`${game.displayName} has no localisation for "${code}"`)
  }
  return validated.data
}

export function parseTargets(game: GameDefinition, codes: string): TranslationTarget[] {
  const targets: TranslationTarget[] = []
  for (const raw of codes.split(',')) {
    const entry = raw.trim()
    if (entry.length === 0) continue

    const colon = entry.indexOf(':')
    const languagePart = colon === -1 ? entry : entry.slice(0, colon)
    const tokenPart = colon === -1 ? undefined : entry.slice(colon + 1)

    const language = normalizeTargetLanguage(languagePart)
    if (!isLanguageLabel(language)) {
      throw new Error(`Invalid target language "${languagePart.trim()}"`)
    }

    const fileToken =
      tokenPart === undefined
        ? builtInTokenFor(game, language)
        : parseCustomToken(tokenPart, language, game)

    targets.push({ language, fileToken })
  }
  if (targets.length === 0) throw new Error(`No target given in "${codes}"`)

  const problem = findTargetListProblem(targets, game.languageFileToken)
  if (problem) throw new Error(describeTargetListProblem(problem, targets, game))

  return targets
}

function builtInTokenFor(game: GameDefinition, language: string): string {
  const fileToken = isLanguageCode(language) ? game.languageFileToken[language] : undefined
  if (fileToken === undefined) {
    throw new Error(
      `"${language}" is not a language ${game.displayName} ships a file name for: write ` +
        `"${language}:<token>" with one of ${Object.values(game.languageFileToken).join(', ')}`
    )
  }
  return fileToken
}

function parseCustomToken(raw: string, language: string, game: GameDefinition): string {
  const fileToken = normalizeFileToken(raw)
  const describe = (problem: TargetListProblem): string =>
    describeTargetListProblem(problem, [{ language, fileToken: raw }], game)

  if (!isFileToken(fileToken)) {
    throw new Error(
      `${describe({ code: 'invalid-token', index: 0 })}: a file token is lowercase letters and ` +
        'underscores, without "l_"'
    )
  }
  if (!isGameToken(fileToken, game.languageFileToken)) {
    throw new Error(describe({ code: 'unknown-token', index: 0, fileToken }))
  }

  return fileToken
}

function describeDroppedTargets(
  game: GameDefinition,
  sourceLanguage: LanguageCode,
  targets: readonly TranslationTarget[]
): string | undefined {
  const resolved = resolveTargets(game, sourceLanguage, targets)
  if (resolved.targets.length > 0) return undefined
  return resolved.warnings.length > 0
    ? resolved.warnings.join(' ; ')
    : 'no target survived resolution'
}

function isConvertMode(value: string): value is ConvertMode {
  return CONVERT_MODES.some(mode => mode === value)
}

function isTargetContent(value: string): value is TargetContent {
  return TARGET_CONTENTS.some(content => content === value)
}

function isProvider(value: string): value is TranslateConfig['provider'] {
  return TRANSLATE_PROVIDERS.some(provider => provider === value)
}
