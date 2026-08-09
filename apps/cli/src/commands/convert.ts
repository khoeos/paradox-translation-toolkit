import { runConvert } from '@ptt/converter'
import type { Cancellation, ConversionOutput, TranslationMod } from '@ptt/converter'
import { nodeFetch, nodeFs } from '@ptt/fs-node'
import { buildRunReport, writeRunReport } from '@ptt/report'
import { createEngineForRun } from '@ptt/translate'

import { consolePort } from '../console-port.js'
import type { CliOptions } from '../options.js'
import { dim, facts, green, num, red, section, yellow } from '../output.js'
import { generatedModPaths, openMemory, printHeader } from './shared.js'

/**
 * The real run, reported afterwards key by key.
 *
 * Ported from PR #4 (e21ee7a, `src/cli/index.ts` `commandConvert`) by Artem Kondrashev. It calls
 * the same `runConvert` the desktop worker calls, through the same `ProgressPort`, and builds its
 * engine and its report with the same factories: that is what guarantees the CLI and the app do
 * strictly the same thing rather than two similar things.
 */

export async function commandConvert(options: CliOptions): Promise<void> {
  printHeader(options)
  facts([
    ['mode', options.mode],
    [
      'translation',
      options.translate
        ? `${options.translate.provider} ${options.translate.model}`
        : dim('off, source strings are copied')
    ]
  ])

  // The flag stops the loops between units of work; the controller cuts the request in flight.
  const abort = new AbortController()
  const cancellation: Cancellation = { requested: false }

  // Ctrl+C has to stop between two units of work: killing the process could leave a half-written
  // localisation file behind, and a truncated translation memory with it.
  process.on('SIGINT', () => {
    cancellation.requested = true
    abort.abort()
    console.error(yellow('\n  stopping after the current mod...'))
  })

  const port = consolePort()
  const memory = await openMemory(options)
  const generated = generatedModPaths(options)
  const startedAt = Date.now()

  const engine = options.translate
    ? await createEngineForRun(
        {
          config: options.translate,
          game: options.game,
          sourceLanguage: options.sourceLanguage,
          targetLanguages: options.targetLanguages,
          memory,
          userDataPath: options.userDataPath,
          signal: abort.signal,
          onProgress: counters => port.emit({ type: 'translate-progress', jobId: 'cli', counters })
        },
        nodeFs,
        nodeFetch
      )
    : undefined

  const translationMod: TranslationMod = {
    name: options.modName,
    folder: generated.folder,
    path: generated.path,
    supportedVersion: '*'
  }

  const { output, untranslated } = await runConvert(
    {
      jobId: 'cli',
      rootDir: options.rootDir,
      game: options.game,
      sourceLanguage: options.sourceLanguage,
      targetLanguages: options.targetLanguages,
      mode: options.mode,
      cancellation,
      memory,
      ...(options.outputDir !== undefined && { outputDir: options.outputDir }),
      ...(options.selectedMods !== undefined && { selectedMods: options.selectedMods }),
      ...(options.mode === 'create-translation-mod' && {
        generatedMod: translationMod,
        generatedModsDir: generated.modsDir
      }),
      ...(engine !== undefined && { engine })
    },
    nodeFs,
    port
  )
  port.done()

  // Always flushed, cancelled or not: what a stopped run did translate must survive.
  await memory.flush()

  const written = await writeRunReport(
    options.reportsDir,
    buildRunReport({
      startedAt,
      finishedAt: Date.now(),
      rootDir: options.rootDir,
      gameId: options.game.id,
      mode: options.mode,
      sourceLanguage: options.sourceLanguage,
      targetLanguages: options.targetLanguages,
      output,
      untranslated,
      ...(options.selectedMods !== undefined && { selectedMods: options.selectedMods }),
      ...(options.translate !== undefined && { translate: options.translate }),
      ...(engine !== undefined && {
        counters: engine.getCounters(),
        refusals: engine.getRefusals()
      })
    }),
    nodeFs
  )

  printResult(output, written?.jsonPath, options.limit)
}

function printResult(
  output: ConversionOutput,
  reportPath: string | undefined,
  limit: number
): void {
  section('Result')
  facts([
    ['mods processed', num(output.totals.mods)],
    ['mods that produced files', num(output.totals.modsWithFiles)],
    ['files created', green(num(output.totals.created))],
    ['files skipped', num(output.totals.skipped)],
    ['files unchanged', num(output.totals.unchanged)],
    ['files failed', output.totals.failed > 0 ? red(num(output.totals.failed)) : '0'],
    ['files pruned', num(output.totals.pruned)],
    ['errors', output.totals.errors > 0 ? red(num(output.totals.errors)) : '0'],
    ['cancelled', output.cancelled === true ? yellow('yes') : 'no'],
    ['report', reportPath ?? dim('none')]
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

  const failing = output.mods.filter(mod => mod.errors.length > 0)
  if (failing.length > 0) {
    section(`Mods with errors (${failing.length})`)
    for (const mod of failing.slice(0, limit)) {
      console.log(`  ${red(mod.name)}`)
      for (const error of mod.errors.slice(0, 3)) console.log(`    ${dim(error)}`)
    }
  }

  console.log(
    reportPath
      ? dim(`\n  Key by key: ${reportPath.replace(/\.json$/, '.csv')}`)
      : dim('\n  No report was written, --user-data may not be writable.')
  )
}
