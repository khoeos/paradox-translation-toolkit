/**
 * Turning command line flags into the same Request the Electron app sends to its worker.
 *
 * The folders Electron resolves through `app.getPath` are resolved here by hand, pointing at
 * the very same places, so a CLI run shares the translation memory, the glossary and the
 * generated mod with the app instead of building a second set of them.
 */

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { ACTIVE_GAMES, GAMES, LANGUAGES_KEYS, type GameId } from '../global/constants'
import { ConvertMode, TranslateProvider, type TranslateConfig } from '../global/types'
import type { Request } from '../main/translateFn'

/** Name Electron derives the userData folder from, it is the productName of package.json */
const APP_FOLDER = 'Paradox Translation Toolkit'

/** Config file read when no --config is given */
export const DEFAULT_CONFIG_FILE = 'ptt.config.json'

export interface Args {
  command: string
  flags: Record<string, string | boolean>
  rest: string[]
}

/**
 * Parse `--flag value`, `--flag=value` and `--switch`
 * @param argv - The arguments, without node and the script
 * @returns The command and its flags
 */
export const parseArgs = (argv: string[]): Args => {
  const flags: Record<string, string | boolean> = {}
  const rest: string[] = []
  let command = ''

  for (let index = 0; index < argv.length; index++) {
    const item = argv[index]
    if (!item.startsWith('-')) {
      if (command) rest.push(item)
      else command = item
      continue
    }

    const name = item.replace(/^-+/, '')
    const [key, inline] = name.includes('=')
      ? [name.slice(0, name.indexOf('=')), name.slice(name.indexOf('=') + 1)]
      : [name, undefined]

    if (inline !== undefined) {
      flags[key] = inline
      continue
    }
    const next = argv[index + 1]
    if (next === undefined || next.startsWith('--')) {
      flags[key] = true
      continue
    }
    flags[key] = next
    index++
  }

  return { command, flags, rest }
}

/** Everything a command needs, after the config file and the flags were merged */
export interface CliOptions {
  request: Request
  game: GameId
  /** Where reports go when no explicit file was given */
  reportsDir: string
  /** Mod name filter, matched on the folder id and on the declared name */
  modFilter?: string
  limit: number
  jsonOut?: string
  csvOut?: string
}

const asString = (value: string | boolean | undefined): string | undefined =>
  typeof value === 'string' ? value : undefined

const asNumber = (value: string | boolean | undefined, fallback: number): number => {
  const parsed = Number(asString(value))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const asBool = (value: string | boolean | undefined, fallback = false): boolean => {
  if (value === undefined) return fallback
  if (typeof value === 'boolean') return value
  return !/^(false|0|no)$/i.test(value)
}

/**
 * Read the config file holding the flags that never change between runs
 * @param file - The config path, or undefined to look for the default one
 * @returns The stored flags, empty when there is no config
 */
const readConfig = (file?: string): Record<string, string | boolean> => {
  const target = file ?? DEFAULT_CONFIG_FILE
  try {
    return JSON.parse(fs.readFileSync(target, 'utf8'))
  } catch (error) {
    // An explicit --config that cannot be read is a mistake worth stopping for
    if (file) throw new Error(`Cannot read ${target}: ${(error as Error).message}`)
    return {}
  }
}

const MODES: Record<string, ConvertMode> = {
  mod: ConvertMode.CREATE_TRANSLATION_MOD,
  add: ConvertMode.ADD_TO_CURRENT,
  extract: ConvertMode.EXTRACT_TO_FOLDER
}

/**
 * Language codes to the folder names the selected game uses
 * @param game - The game
 * @param codes - Comma separated language codes (ru, en, ...)
 * @returns The game language keys
 */
const toLanguageKeys = (game: GameId, codes: string): string[] =>
  codes
    .split(',')
    .map((code) => code.trim().toLowerCase())
    .filter(Boolean)
    .map((code) => {
      if (!LANGUAGES_KEYS.includes(code as (typeof LANGUAGES_KEYS)[number])) {
        throw new Error(`Unknown language "${code}", expected one of ${LANGUAGES_KEYS.join(', ')}`)
      }
      return GAMES[game].languageKeys[code as (typeof LANGUAGES_KEYS)[number]]
    })

/**
 * Build the request and the output options of a command
 * @param args - The parsed command line
 * @returns Everything the command needs
 */
/** Commands that read mods; the others only need to know where the app keeps its data */
const NEEDS_PATH = ['scan', 'audit', 'convert']

export const buildOptions = (args: Args): CliOptions => {
  // A flag always beats the config file, so one run can differ without editing anything
  const config = readConfig(asString(args.flags.config))
  const flags = { ...config, ...args.flags }

  const game = (asString(flags.game) ?? 'ck3') as GameId
  if (!ACTIVE_GAMES.includes(game) && !GAMES[game]) {
    throw new Error(`Unknown game "${game}", expected one of ${Object.keys(GAMES).join(', ')}`)
  }

  const modsPath = asString(flags.path)
  if (!modsPath && NEEDS_PATH.includes(args.command)) {
    throw new Error('--path is required: the folder holding the mods to scan')
  }

  const documentsPath = asString(flags.documents) ?? path.join(os.homedir(), 'Documents')
  const userDataPath =
    asString(flags['user-data']) ??
    path.join(process.env.APPDATA ?? path.join(os.homedir(), '.config'), APP_FOLDER)

  const mode = MODES[asString(flags.mode) ?? 'mod']
  if (mode === undefined) {
    throw new Error(`Unknown --mode, expected one of ${Object.keys(MODES).join(', ')}`)
  }

  const translate: TranslateConfig | undefined = asBool(flags.translate)
    ? {
        enabled: true,
        provider: (asString(flags.provider) ?? TranslateProvider.OLLAMA) as TranslateProvider,
        baseUrl: asString(flags['base-url']) ?? 'http://localhost:11434',
        model: asString(flags.model) ?? 'qwen2.5:7b',
        // A key on the command line ends up in the shell history, the environment is safer
        apiKey: asString(flags['api-key']) ?? process.env.PTT_API_KEY,
        batchSize: asNumber(flags.batch, 20),
        concurrency: asNumber(flags.concurrency, 2),
        retries: asNumber(flags.retries, 2),
        timeout: asNumber(flags.timeout, 120000),
        gamePath: asString(flags['game-path'])
      }
    : undefined

  const request: Request = {
    path: modsPath ?? '',
    game,
    sourceLanguage: toLanguageKeys(game, asString(flags.from) ?? 'en')[0],
    targetLanguages: toLanguageKeys(game, asString(flags.to) ?? 'ru'),
    mode,
    outputPath: asString(flags.out),
    modName: asString(flags['mod-name']) ?? 'Missing Translations',
    documentsPath,
    userDataPath,
    selectedMods: asString(flags.mods)
      ?.split(',')
      .map((id) => id.trim())
      .filter(Boolean),
    translate
  }

  return {
    request,
    game,
    reportsDir: path.join(userDataPath, 'reports'),
    modFilter: asString(flags.mod),
    limit: asNumber(flags.limit, 30),
    jsonOut: asString(flags.json),
    csvOut: asString(flags.csv)
  }
}
