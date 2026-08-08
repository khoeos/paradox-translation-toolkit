/**
 * A headless front end to the same worker the app runs, meant for testing this toolkit
 * against a real mod collection.
 *
 * The window shows counters; this shows the keys behind them. `audit` is the reason it
 * exists: it says which strings are still English and which were never generated at all,
 * mod by mod and key by key, which no amount of staring at the progress bar can.
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import { GAMES } from '../global/constants'
import {
  ConversionStatusType,
  ConvertMode,
  KeyState,
  type ConversionOutput,
  type KeyReport,
  type ScanOutput,
  type ScannedMod,
  type TranslationCounters
} from '../global/types'
import { cancellation, launchScan, launchTranslation } from '../main/translateFn'
import { createProvider } from '../main/translate/providers'
import { writeKeyCsv } from '../main/report'
import { buildOptions, parseArgs, type Args, type CliOptions } from './options'
import {
  bold,
  clearTicker,
  cyan,
  dim,
  facts,
  green,
  num,
  red,
  section,
  table,
  ticker,
  yellow
} from './output'

const HELP = `
${bold('Paradox Translation Toolkit — developer CLI')}

  npm run ptt -- <command> [flags]

${bold('Commands')}
  scan       What every mod is missing, the generated mod counted as coverage
  audit      The same, key by key: which strings are still English and why
  convert    Run a real conversion, optionally translating
  provider   Send one string to the configured backend and print what comes back
  memory     Size of the translation memory shared with the app, or clear it
  reports    List the run reports written by earlier conversions

${bold('Where things are')}
  Flags may live in ${cyan('ptt.config.json')} next to package.json, so a run is just
  ${cyan('npm run ptt -- audit')}. A flag on the command line always wins.

${bold('Common flags')}
  --path <dir>          Folder holding the mods (a workshop content folder, or one mod)
  --game <id>           ck3 (default), stl, hoi4, eu4, vic3
  --from <code>         Source language, default en
  --to <codes>          Target languages, comma separated, default ru
  --mod-name <name>     Generated mod name, default "Missing Translations"
  --mod <text>          Only mods whose id or name contains this
  --limit <n>           Rows to print, default 30
  --json <file>         Write the raw result as JSON
  --csv <file>          Write the key level rows as CSV
  --documents <dir>     Override the Documents folder
  --user-data <dir>     Override the app data folder (memory, glossary, reports)

${bold('audit flags')}
  --state <name>        own, patch, generated, kept, english, missing, or all
                        (default english: the ones a retry could still fix)

${bold('convert flags')}
  --mode <name>         mod (default), add, extract
  --out <dir>           Destination for --mode extract
  --mods <a,b,c>        Only these mod folders
  --translate           Actually translate, instead of copying the source strings
  --provider <name>     ollama (default), openai, rapidapi
  --base-url <url>      Backend endpoint
  --model <name>        Model name
  --api-key <key>       Prefer the PTT_API_KEY environment variable
  --batch <n>           Strings per request, default 20
  --concurrency <n>     Requests in flight, default 2
  --retries <n>         Attempts before a batch is split, default 2
  --timeout <ms>        Per request timeout, default 120000
  --game-path <dir>     Game installation, its own localisation becomes the glossary

${bold('Examples')}
  npm run ptt -- scan --path "D:/SteamLibrary/steamapps/workshop/content/1158310"
  npm run ptt -- audit --state english --limit 50 --csv refused.csv
  npm run ptt -- audit --mod "Muslim Enchantments" --state missing
  npm run ptt -- convert --translate --provider rapidapi --batch 150
`

/** The worker posts progress to a port; without a worker, it posts here */
const consolePort = (
  onProgress?: (progress: { current: number; total: number; modName: string }) => void
): { postMessage: (message: Record<string, unknown>) => void } => ({
  postMessage: (message): void => {
    if (message.type === ConversionStatusType.PROGRESS) {
      onProgress?.(message as unknown as { current: number; total: number; modName: string })
    } else if (message.type === ConversionStatusType.LOG) {
      // Log messages are i18n keys, the values behind them are what carries the meaning
      const values = message.values ? ` ${JSON.stringify(message.values)}` : ''
      console.error(dim(`  · ${String(message.message).replace('conversionLog.', '')}${values}`))
    }
  }
})

/** Sum a per language record */
const total = (counts: Record<string, number>): number =>
  Object.values(counts).reduce((sum, count) => sum + count, 0)

/**
 * Keep only the mods the user pointed at
 * @param mods - Every scanned mod
 * @param filter - Text matched against the folder id and the declared name
 * @returns The matching mods, all of them when there is no filter
 */
const filterMods = <T extends { id: string; name: string }>(mods: T[], filter?: string): T[] => {
  if (!filter) return mods
  const needle = filter.toLowerCase()
  return mods.filter(
    (mod) => mod.id.toLowerCase().includes(needle) || mod.name.toLowerCase().includes(needle)
  )
}

/**
 * Say what the run is about before it starts, so a report is never read against the
 * wrong folder or the wrong language
 * @param options - The command options
 */
const printHeader = (options: CliOptions): void => {
  const { request } = options
  facts([
    ['game', `${GAMES[options.game].name} (${options.game})`],
    ['path', request.path],
    ['languages', `${request.sourceLanguage} → ${request.targetLanguages.join(', ')}`],
    ['generated mod', request.modName ?? ''],
    ['app data', request.userDataPath ?? '']
  ])
}

/**
 * Run a scan, showing progress while it goes
 * @param options - The command options
 * @param detail - Also collect the state of every key
 * @returns The scan result
 */
const runScan = async (
  options: CliOptions,
  detail: boolean
): Promise<ScanOutput & { keyStates?: KeyReport[] }> => {
  const tick = ticker()
  const port = consolePort((progress) =>
    tick(`  scanning ${progress.current}/${progress.total}  ${progress.modName}`)
  )
  const output = await launchScan(options.request, port, detail)
  clearTicker()
  return output
}

/** Print the collection wide numbers of a scan */
const printScanTotals = (output: ScanOutput): void => {
  const { totals } = output
  const missing = sumMissing(output)
  section('Collection')
  facts([
    ['mods', num(totals.mods)],
    ['without localisation', num(totals.withoutLocalisation)],
    ['other spelling', num(totals.otherSpelling)],
    ['keys covered', green(num(totals.coveredKeys))],
    ['keys still to do', yellow(num(missing))],
    [
      '  of which refused',
      totals.englishKeys > 0
        ? `${red(num(totals.englishKeys))} ${dim('left in English by an earlier run')}`
        : '0'
    ],
    ['  of which new', num(Math.max(0, missing - totals.englishKeys))],
    ['files to write', num(totals.missingFiles)],
    ['translatable lines', totals.missingLines > 0 ? num(totals.missingLines) : dim('n/a')]
  ])

  if (output.selfCopy) {
    console.log(
      `\n  ${yellow('A copy of the generated mod sits in the scanned folder and was left out:')}` +
        `\n  ${output.selfCopy}` +
        `\n  ${dim('Left in, it would count as somebody else’s translation and vouch for its own English.')}`
    )
  }

  if (output.generatedMod) {
    section('Generated mod')
    facts([
      ['path', output.generatedMod.path],
      ['keys translated', green(num(output.generatedMod.translated))],
      ['keys still English', red(num(output.generatedMod.english))],
      [
        'keys kept as they were',
        output.generatedMod.kept > 0
          ? `${num(output.generatedMod.kept)} ${dim('the backend answered with the source text, no retry would help')}`
          : '0'
      ],
      [
        'keys shadowing others',
        output.generatedMod.shadowed > 0
          ? `${yellow(num(output.generatedMod.shadowed))} ${dim('somebody else translates these, our mod loads last and hides them')}`
          : '0'
      ],
      [
        'orphan folders',
        output.generatedMod.orphanNamespaces.length === 0
          ? '0'
          : `${output.generatedMod.orphanNamespaces.length}  ${dim(
              output.generatedMod.orphanNamespaces.slice(0, 5).join(', ')
            )}`
      ]
    ])
    if (output.generatedMod.shadowed > 0) {
      console.log(
        dim('\n  A convert run drops the shadowing keys and rewrites the files without them.')
      )
    }
  } else {
    console.log(dim('\n  No generated mod found yet, nothing was produced by an earlier run.'))
  }
}

/** Missing keys across the collection, the totals only carry files */
const sumMissing = (output: ScanOutput): number =>
  output.mods.reduce((sum, mod) => sum + total(mod.missingKeys), 0)

/**
 * The scan command: what is missing, with our own output counted as coverage
 * @param options - The command options
 */
const commandScan = async (options: CliOptions): Promise<void> => {
  printHeader(options)
  const output = await runScan(options, false)
  printScanTotals(output)

  const mods = filterMods(output.mods, options.modFilter)
    .filter(
      (mod) =>
        total(mod.missingKeys) > 0 || total(mod.englishKeys) > 0 || total(mod.shadowedKeys) > 0
    )
    .sort((a, b) => total(b.missingKeys) - total(a.missingKeys))

  section(`Mods needing work (${mods.length}, showing ${Math.min(mods.length, options.limit)})`)
  table(
    [
      { header: 'mod', max: 44 },
      { header: 'id', max: 16 },
      { header: 'source', right: true },
      { header: 'covered', right: true },
      { header: 'to do', right: true },
      { header: 'refused', right: true },
      { header: 'shadowing', right: true },
      { header: 'files', right: true }
    ],
    mods
      .slice(0, options.limit)
      .map((mod) => [
        mod.name,
        mod.id,
        num(mod.sourceKeys),
        green(num(total(mod.coveredKeys))),
        yellow(num(total(mod.missingKeys))),
        total(mod.englishKeys) > 0 ? red(num(total(mod.englishKeys))) : dim('0'),
        total(mod.shadowedKeys) > 0 ? yellow(num(total(mod.shadowedKeys))) : dim('0'),
        num(mod.missingFiles)
      ])
  )

  // Shadowing is invisible in the list above, which is sorted by what is left to do, yet it
  // is the one problem that makes the game worse than not running the tool at all
  const shadowing = filterMods(output.mods, options.modFilter)
    .filter((mod) => total(mod.shadowedKeys) > 0)
    .sort((a, b) => total(b.shadowedKeys) - total(a.shadowedKeys))

  if (shadowing.length > 0) {
    section(`Mods whose translation our generated mod hides (${shadowing.length})`)
    table(
      [
        { header: 'mod', max: 46 },
        { header: 'keys hidden', right: true },
        { header: 'translated by', max: 46 }
      ],
      shadowing
        .slice(0, options.limit)
        .map((mod) => [
          mod.name,
          yellow(num(total(mod.shadowedKeys))),
          dim(mod.coveredBy?.join(', ') || 'the mod itself')
        ])
    )
  }

  const broken = output.mods.filter((mod) => mod.errors.length > 0)
  if (broken.length > 0) {
    section(`Mods that could not be read fully (${broken.length})`)
    for (const mod of broken.slice(0, options.limit)) {
      console.log(`  ${red(mod.name)}  ${dim(mod.errors[0])}`)
    }
  }

  await writeOutputs(options, output, [])
}

/** Order the audit prints its state summary in, from best to worst */
const STATE_ORDER = [
  KeyState.OWN,
  KeyState.PATCH,
  KeyState.GENERATED,
  KeyState.KEPT,
  KeyState.ENGLISH,
  KeyState.MISSING
]

const STATE_LABEL: Record<KeyState, string> = {
  [KeyState.OWN]: 'translated by the mod itself',
  [KeyState.PATCH]: 'translated by a localisation mod',
  [KeyState.GENERATED]: 'translated by us',
  [KeyState.KEPT]: 'the backend answered with the source text, mostly proper names',
  [KeyState.ENGLISH]: 'left in English by us — refused',
  [KeyState.MISSING]: 'never generated'
}

/**
 * The audit command: the state of every key, and the list of the ones still in English
 * @param options - The command options
 * @param args - The parsed command line, for --state
 */
const commandAudit = async (options: CliOptions, args: Args): Promise<void> => {
  printHeader(options)
  const output = await runScan(options, true)
  const keyStates = filterMods(
    (output.keyStates ?? []).map((key) => ({ ...key, id: key.modId, name: key.modName })),
    options.modFilter
  )

  printScanTotals(output)

  section('Every key of the collection')
  const counts = new Map<KeyState, number>()
  for (const key of keyStates) counts.set(key.state, (counts.get(key.state) ?? 0) + 1)
  const grand = keyStates.length || 1
  table(
    [
      { header: 'state' },
      { header: 'keys', right: true },
      { header: 'share', right: true },
      { header: 'meaning' }
    ],
    STATE_ORDER.map((state) => {
      const value = counts.get(state) ?? 0
      const paint =
        state === KeyState.ENGLISH
          ? red
          : state === KeyState.MISSING
            ? yellow
            : state === KeyState.KEPT
              ? dim
              : green
      return [
        paint(state),
        num(value),
        `${((value / grand) * 100).toFixed(1)}%`,
        dim(STATE_LABEL[state])
      ]
    })
  )

  const wanted = String(args.flags.state ?? KeyState.ENGLISH).toLowerCase()
  if (wanted !== 'all' && !STATE_ORDER.includes(wanted as KeyState)) {
    throw new Error(`Unknown --state "${wanted}", expected all or one of ${STATE_ORDER.join(', ')}`)
  }
  const selected =
    wanted === 'all' ? keyStates : keyStates.filter((key) => String(key.state) === wanted)

  section(
    `Keys in state ${wanted} (${selected.length}, showing ${Math.min(selected.length, options.limit)})`
  )
  table(
    [
      { header: 'mod', max: 28 },
      { header: 'key', max: 40 },
      { header: 'source value', max: 64 },
      { header: 'note' }
    ],
    selected
      .slice(0, options.limit)
      .map((key) => [
        key.modName,
        key.key,
        key.source.replace(/\s+/g, ' '),
        key.shadowed ? yellow('shadowed by us') : key.markupOnly ? dim('markup only') : ''
      ])
  )

  // Which mods hold the refusals is what decides where to spend a retry
  const worst = new Map<string, number>()
  for (const key of keyStates) {
    if (key.state !== KeyState.ENGLISH) continue
    worst.set(key.modName, (worst.get(key.modName) ?? 0) + 1)
  }
  if (worst.size > 0) {
    section('Refusals by mod')
    table(
      [
        { header: 'mod', max: 50 },
        { header: 'keys left in English', right: true }
      ],
      [...worst.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, options.limit)
        .map(([name, count]) => [name, red(num(count))])
    )
  }

  console.log(
    dim(
      `\n  A key counts as refused when our generated file repeats the English text word for word.\n  Values made only of markup or numbers are never sent to a translator and are not counted.`
    )
  )

  await writeOutputs(options, output, selected)
}

/**
 * The convert command: the real run, reported afterwards key by key
 * @param options - The command options
 */
const commandConvert = async (options: CliOptions): Promise<void> => {
  printHeader(options)
  facts([
    ['mode', ConvertMode[options.request.mode]],
    [
      'translation',
      options.request.translate
        ? `${options.request.translate.provider} ${options.request.translate.model}`
        : dim('off, source strings are copied')
    ]
  ])

  // Ctrl+C has to stop between two units of work, killing the process could leave a
  // half written localisation file behind
  process.on('SIGINT', () => {
    cancellation.requested = true
    cancellation.controller.abort()
    console.error(yellow('\n  stopping after the current mod…'))
  })

  const tick = ticker()
  const port = consolePort((progress) => {
    const counters = (progress as { translation?: TranslationCounters }).translation
    const suffix = counters
      ? `  ${counters.translated} translated, ${counters.cached} cached, ${counters.failed} refused`
      : ''
    tick(`  ${progress.current}/${progress.total}  ${progress.modName}${suffix}`)
  })

  const output: ConversionOutput = await launchTranslation(options.request, port)
  clearTicker()

  section('Result')
  facts([
    ['mods processed', num(output.totals.mods)],
    ['mods that produced files', num(output.totals.modsWithFiles)],
    ['files created', green(num(output.totals.created))],
    ['files skipped', num(output.totals.skipped)],
    ['files failed', output.totals.failed > 0 ? red(num(output.totals.failed)) : '0'],
    ['files pruned', num(output.totals.pruned)],
    ['errors', output.totals.errors > 0 ? red(num(output.totals.errors)) : '0'],
    ['cancelled', output.cancelled ? yellow('yes') : 'no'],
    ['report', output.reportPath ?? dim('none')]
  ])

  if (output.translation) {
    section('Strings')
    facts([
      ['translated', green(num(output.translation.translated))],
      ['from memory', num(output.translation.cached)],
      ['refused', output.translation.failed > 0 ? red(num(output.translation.failed)) : '0']
    ])
  }

  if (output.translationMod) {
    section('Generated mod')
    facts([
      ['name', output.translationMod.name],
      ['path', output.translationMod.path],
      ['supported version', output.translationMod.supportedVersion]
    ])
  }

  const failing = output.mods.filter((mod) => mod.errors.length > 0)
  if (failing.length > 0) {
    section(`Mods with errors (${failing.length})`)
    for (const mod of failing.slice(0, options.limit)) {
      console.log(`  ${red(mod.name)}`)
      for (const error of mod.errors.slice(0, 3)) console.log(`    ${dim(error)}`)
    }
  }

  console.log(
    output.reportPath
      ? dim(`\n  Key by key: ${output.reportPath.replace(/\.json$/, '.csv')}`)
      : dim('\n  No report was written, --user-data may not be writable.')
  )
}

/**
 * The provider command: prove the backend answers before spending a night on a collection
 * @param options - The command options
 * @param args - The parsed command line, rest holds the sample string
 */
const commandProvider = async (options: CliOptions, args: Args): Promise<void> => {
  const config = options.request.translate
  if (!config) throw new Error('Pass --translate together with the provider flags')

  const sample =
    args.rest.length > 0 ? args.rest : ['Colony Ship', 'Gain £gold£ and $VALUE$ prestige']
  const language = options.request.targetLanguages[0]
  facts([
    ['provider', config.provider],
    ['endpoint', config.baseUrl],
    ['model', config.model],
    [
      'api key',
      config.apiKey ? `${config.apiKey.slice(0, 4)}… (${config.apiKey.length} chars)` : dim('none')
    ],
    ['language', language]
  ])

  const started = Date.now()
  const answers = await createProvider({ ...config, domain: GAMES[options.game].domain }).translate(
    sample,
    language
  )
  section(`Answer in ${Date.now() - started} ms`)
  sample.forEach((text, index) => {
    console.log(`  ${dim(text)}`)
    console.log(`  ${green(answers[index] ?? '(nothing)')}\n`)
  })
}

/**
 * The memory command: how much the shared translation memory holds
 * @param options - The command options
 * @param args - The parsed command line, --clear empties it
 */
const commandMemory = async (options: CliOptions, args: Args): Promise<void> => {
  const folder = path.join(options.request.userDataPath ?? '', 'translation-memory')

  if (args.flags.clear) {
    await fs.rm(folder, { recursive: true, force: true })
    console.log(green(`  cleared ${folder}`))
    return
  }

  section(`Translation memory  ${dim(folder)}`)
  let files: string[]
  try {
    files = await fs.readdir(folder)
  } catch {
    console.log(dim('  nothing remembered yet'))
    return
  }

  const rows: string[][] = []
  for (const file of files.filter((name) => name.endsWith('.json'))) {
    const full = path.join(folder, file)
    const [content, stat] = await Promise.all([fs.readFile(full, 'utf8'), fs.stat(full)])
    const entries = Object.keys(JSON.parse(content)).length
    rows.push([
      path.basename(file, '.json'),
      num(entries),
      `${(stat.size / 1024 / 1024).toFixed(1)} MB`,
      stat.mtime.toISOString().slice(0, 16).replace('T', ' ')
    ])
  }

  table(
    [
      { header: 'language' },
      { header: 'strings', right: true },
      { header: 'size', right: true },
      { header: 'updated' }
    ],
    rows
  )
  console.log(dim('\n  Clear it with --clear to force every string through the backend again.'))
}

/**
 * The reports command: what earlier runs wrote
 * @param options - The command options
 * @param args - The parsed command line, --last opens the newest report
 */
const commandReports = async (options: CliOptions, args: Args): Promise<void> => {
  section(`Run reports  ${dim(options.reportsDir)}`)

  let files: string[]
  try {
    files = (await fs.readdir(options.reportsDir)).filter((name) => name.endsWith('.json')).sort()
  } catch {
    console.log(dim('  no report yet, run convert first'))
    return
  }

  if (files.length === 0) {
    console.log(dim('  no report yet, run convert first'))
    return
  }

  const chosen = args.flags.last ? files[files.length - 1] : undefined
  if (!chosen) {
    table(
      [{ header: 'report' }, { header: 'size', right: true }],
      await Promise.all(
        files.slice(-options.limit).map(async (file) => {
          const stat = await fs.stat(path.join(options.reportsDir, file))
          return [file, `${(stat.size / 1024).toFixed(0)} KB`]
        })
      )
    )
    console.log(dim('\n  Add --last to summarise the newest one.'))
    return
  }

  const report = JSON.parse(await fs.readFile(path.join(options.reportsDir, chosen), 'utf8'))
  section(chosen)
  facts([
    ['started', report.startedAt],
    ['seconds', report.seconds],
    ['path', report.request?.path ?? ''],
    ['provider', report.request?.translate?.provider ?? 'none'],
    ['files created', report.totals?.created ?? 0],
    ['strings translated', report.counters?.translated ?? 0],
    ['strings from memory', report.counters?.cached ?? 0],
    ['strings refused', report.counters?.failed ?? 0],
    ['keys left in English', report.untranslated?.length ?? 0]
  ])

  const reasons = report.refusalsByReason as Record<string, number> | undefined
  if (reasons && Object.keys(reasons).length > 0) {
    section('Why strings were refused')
    table(
      [{ header: 'reason' }, { header: 'strings', right: true }],
      Object.entries(reasons)
        .sort((a, b) => b[1] - a[1])
        .map(([reason, count]) => [reason, num(count)])
    )
  }

  const untranslated = (report.untranslated ?? []) as KeyReport[]
  section(`Keys left in English (showing ${Math.min(untranslated.length, options.limit)})`)
  table(
    [
      { header: 'mod', max: 26 },
      { header: 'key', max: 36 },
      { header: 'reason', max: 40 },
      { header: 'source value', max: 50 }
    ],
    untranslated
      .slice(0, options.limit)
      .map((key) => [key.modName, key.key, key.reason ?? '', key.source.replace(/\s+/g, ' ')])
  )
}

/**
 * Write the machine readable outputs a command was asked for
 * @param options - The command options
 * @param output - The scan result
 * @param keys - The key rows the command selected
 */
const writeOutputs = async (
  options: CliOptions,
  output: ScanOutput,
  keys: KeyReport[]
): Promise<void> => {
  if (options.jsonOut) {
    await fs.mkdir(path.dirname(path.resolve(options.jsonOut)), { recursive: true })
    await fs.writeFile(
      options.jsonOut,
      JSON.stringify({ ...output, keys: keys.length > 0 ? keys : undefined }, null, 2),
      'utf8'
    )
    console.log(dim(`\n  json → ${options.jsonOut}`))
  }

  if (options.csvOut) {
    await writeKeyCsv(path.resolve(options.csvOut), keys.length > 0 ? keys : toModRows(output.mods))
    console.log(dim(`  csv  → ${options.csvOut}`))
  }
}

/** Without key detail the CSV still says what each mod is missing */
const toModRows = (mods: ScannedMod[]): KeyReport[] =>
  mods.flatMap((mod) =>
    Object.keys(mod.missingKeys).map((language) => ({
      modId: mod.id,
      modName: mod.name,
      language,
      key: '',
      file: mod.path,
      source: '',
      state: KeyState.MISSING,
      reason: `${mod.missingKeys[language]} missing, ${mod.coveredKeys[language]} covered, ${mod.englishKeys[language]} english`
    }))
  )

const COMMANDS: Record<string, (options: CliOptions, args: Args) => Promise<void>> = {
  scan: commandScan,
  audit: commandAudit,
  convert: commandConvert,
  provider: commandProvider,
  memory: commandMemory,
  reports: commandReports
}

const main = async (): Promise<void> => {
  const args = parseArgs(process.argv.slice(2))

  if (!args.command || args.flags.help || args.flags.h) {
    console.log(HELP)
    return
  }

  const command = COMMANDS[args.command]
  if (!command) {
    console.error(red(`Unknown command "${args.command}"`))
    console.log(HELP)
    process.exitCode = 1
    return
  }

  const started = Date.now()
  await command(buildOptions(args), args)
  console.log(dim(`\n  done in ${((Date.now() - started) / 1000).toFixed(1)} s`))
}

main().catch((error: Error) => {
  clearTicker()
  console.error(`\n${red('error')} ${error.message}`)
  if (process.env.PTT_DEBUG) console.error(error.stack)
  process.exitCode = 1
})
