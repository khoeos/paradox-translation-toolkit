import { DEFAULT_MOD_NAME, posixJoin } from '@ptt/converter'
import { getAllGameIds, getGame } from '@ptt/games'
import type { GameDefinition } from '@ptt/shared'
import {
  CONVERT_MODES,
  LANGUAGE_CODES,
  LanguageCodeSchema,
  TARGET_CONTENTS
} from '@ptt/shared'
import type { ConvertMode, LanguageCode, TargetContent } from '@ptt/shared'
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
  targetLanguages: LanguageCode[]
  mode: ConvertMode
  targetContent: TargetContent
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

export function buildOptions(args: Args): CliOptions {
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

  const userDataPath = resolveUserData(asString(flags['user-data']))
  const outputDir = asString(flags.out)
  const modFilter = asString(flags.mod)
  const jsonOut = asString(flags.json)
  const csvOut = asString(flags.csv)
  const selectedMods = asList(flags.mods)
  const translate = buildTranslate(flags, game)

  return {
    command: args.command,
    rootDir: rootDir ?? '',
    game,
    sourceLanguage: parseLanguages(game, asString(flags.from) ?? 'en')[0] ?? 'en',
    targetLanguages: parseLanguages(game, asString(flags.to) ?? 'ru'),
    mode,
    targetContent,
    modName: asString(flags['mod-name']) ?? DEFAULT_MOD_NAME,
    documentsPath: resolveDocuments(asString(flags.documents)),
    userDataPath,
    reportsDir: posixJoin(userDataPath, 'reports'),
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

export function parseLanguages(game: GameDefinition, codes: string): LanguageCode[] {
  const parsed: LanguageCode[] = []
  for (const raw of codes.split(',')) {
    const code = raw.trim()
    if (code.length === 0) continue
    const validated = LanguageCodeSchema.safeParse(code)
    if (!validated.success) {
      throw new Error(`Unknown language "${code}", expected one of ${LANGUAGE_CODES.join(', ')}`)
    }
    if (game.languageFileToken[validated.data] === undefined) {
      throw new Error(`${game.displayName} has no localisation for "${code}"`)
    }
    parsed.push(validated.data)
  }
  if (parsed.length === 0) throw new Error(`No language given in "${codes}"`)
  return parsed
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
