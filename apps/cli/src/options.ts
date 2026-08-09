import { DEFAULT_MOD_NAME, posixJoin } from '@ptt/converter'
import { getAllGameIds, getGame } from '@ptt/game-registry'
import type { GameDefinition } from '@ptt/shared'
import { CONVERT_MODES, LANGUAGE_CODES, LanguageCodeSchema } from '@ptt/shared'
import type { ConvertMode, LanguageCode } from '@ptt/shared'
import type { TranslateConfig } from '@ptt/translate'
import { PROVIDER_DEFAULTS, TRANSLATE_DEFAULTS, TRANSLATE_PROVIDERS } from '@ptt/translate'

import type { Args } from './args.js'
import { asBool, asList, asNumber, asString } from './coerce.js'
import { readConfig } from './config.js'
import { resolveDocuments, resolveUserData } from './user-data.js'

/**
 * Turning command line flags into what the desktop worker receives.
 *
 * Ported from PR #4 (e21ee7a, `src/cli/options.ts` `buildOptions`) by Artem Kondrashev. Languages
 * and games go through the registry and the zod schema rather than through a cast: the original
 * checked `ACTIVE_GAMES`, a list that had drifted out of use and rejected nothing.
 */

/** Short names for the three modes, kept from the original so a script keeps working. */
const MODE_ALIASES: Record<string, ConvertMode> = {
  mod: 'create-translation-mod',
  add: 'add-to-current',
  extract: 'extract-to-folder'
}

/** Commands that read mods; the others only need to know where the app keeps its data. */
const NEEDS_PATH = new Set(['scan', 'audit', 'convert'])

const DEFAULT_ROWS = 30

export interface CliOptions {
  command: string
  rootDir: string
  game: GameDefinition
  sourceLanguage: LanguageCode
  targetLanguages: LanguageCode[]
  mode: ConvertMode
  outputDir?: string
  modName: string
  selectedMods?: string[]
  documentsPath: string
  userDataPath: string
  /** Where reports go when no explicit file was given. */
  reportsDir: string
  translate?: TranslateConfig
  /** Mod name filter, matched on the folder id and on the declared name. */
  modFilter?: string
  limit: number
  jsonOut?: string
  csvOut?: string
}

/**
 * Build everything a command needs.
 * @param args - The parsed command line
 * @returns The resolved options
 * @throws With a message naming the valid values, for any flag that does not parse
 */
export function buildOptions(args: Args): CliOptions {
  // A flag always beats the config file, so one run can differ without editing anything.
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

  // A key on the command line ends up in the shell history, so the environment is the safer
  // route and the help says so.
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

/**
 * Language codes, validated and checked against the selected game.
 * @param game - The game, whose `languageFileToken` says what it supports
 * @param codes - Comma-separated language codes (`ru`, `en`, ...)
 * @returns The codes, in the order given
 */
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

function isProvider(value: string): value is TranslateConfig['provider'] {
  return TRANSLATE_PROVIDERS.some(provider => provider === value)
}
