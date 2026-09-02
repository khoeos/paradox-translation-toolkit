import { posixDirname, resolveGeneratedMod, scanMods, sumByLanguage } from '@ptt/converter'
import type { GeneratedModPaths, KeyReport, ScanOutput, ScannedMod } from '@ptt/converter'
import { nodeFs } from '@ptt/fs-node'
import { writeKeyCsv } from '@ptt/report'
import { openTranslationMemory } from '@ptt/translate'
import type { TranslationMemory } from '@ptt/translate'

import { consolePort } from '../console-port.js'
import type { CliOptions } from '../options.js'
import { dim, facts, green, num, red, section, yellow } from '../output.js'

export function sumMissing(output: ScanOutput): number {
  return output.mods.reduce((sum, mod) => sum + sumByLanguage(mod.missingKeys), 0)
}

export function printHeader(options: CliOptions): void {
  facts([
    ['game', `${options.game.displayName} (${options.game.id})`],
    ['path', options.rootDir],
    ['languages', `${options.sourceLanguage} → ${options.targetLanguages.join(', ')}`],
    ['generated mod', options.modName],
    ['app data', options.userDataPath]
  ])
}

export async function openMemory(options: CliOptions): Promise<TranslationMemory> {
  return openTranslationMemory(
    options.userDataPath,
    options.game.id,
    options.translate,
    options.targetLanguages,
    nodeFs
  )
}

export function generatedModPaths(options: CliOptions): GeneratedModPaths {
  return resolveGeneratedMod(options.documentsPath, options.game, options.modName)
}

export async function runScan(options: CliOptions, detail: boolean): Promise<ScanOutput> {
  const port = consolePort()
  const memory = await openMemory(options)
  const generated = generatedModPaths(options)

  const output = await scanMods(
    {
      rootDir: options.rootDir,
      gameDef: options.game,
      sourceLanguage: options.sourceLanguage,
      targetLanguages: options.targetLanguages,
      countLines: options.translate?.enabled === true,
      detail,
      targetContent: options.targetContent,
      memory,
      generatedModPath: generated.path,
      generatedModFolder: generated.folder,
      onProgress: (processed, total, modName, totals) =>
        port.emit({ type: 'mod-progress', jobId: 'cli', processed, total, modName, totals }),
      onPhase: (phase, done, total) =>
        port.emit({
          type: 'scan-phase',
          jobId: 'cli',
          phase,
          ...(done !== undefined && { done }),
          ...(total !== undefined && { total })
        }),
      onDiagnostic: (message, severity) =>
        port.emit({ type: 'log', jobId: 'cli', message, severity })
    },
    nodeFs
  )
  port.done()
  return output
}

export function printScanTotals(output: ScanOutput): void {
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
        ? `${red(num(totals.englishKeys))} ${dim('left in the source language by an earlier run')}`
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
        `\n  ${dim('Left in, it would count as somebody else’s translation and vouch for its own leftovers.')}`
    )
  }

  if (output.generatedMod) {
    const generated = output.generatedMod
    section('Generated mod')
    facts([
      ['path', generated.path],
      ['keys translated', green(num(generated.translated))],
      ['keys still in the source language', red(num(generated.english))],
      [
        'keys kept as they were',
        generated.kept > 0
          ? `${num(generated.kept)} ${dim('the backend answered with the source text, no retry would help')}`
          : '0'
      ],
      [
        'keys shadowing others',
        generated.shadowed > 0
          ? `${yellow(num(generated.shadowed))} ${dim('somebody else translates these, our mod loads last and hides them')}`
          : '0'
      ],
      [
        'orphan folders',
        generated.orphanNamespaces.length === 0
          ? '0'
          : `${generated.orphanNamespaces.length}  ${dim(generated.orphanNamespaces.slice(0, 5).join(', '))}`
      ]
    ])
    if (generated.shadowed > 0) {
      console.log(
        dim('\n  A convert run drops the shadowing keys and rewrites the files without them.')
      )
    }
  } else {
    console.log(dim('\n  No generated mod found yet, nothing was produced by an earlier run.'))
  }
}

export async function writeOutputs(
  options: CliOptions,
  output: ScanOutput,
  keys: readonly KeyReport[]
): Promise<void> {
  if (options.jsonOut !== undefined) {
    const dir = posixDirname(options.jsonOut)
    if (dir.length > 0) await nodeFs.mkdir(dir, { recursive: true })
    const payload = { ...output, keys: keys.length > 0 ? keys : undefined }
    await nodeFs.writeFile(options.jsonOut, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8')
    console.log(dim(`\n  json → ${options.jsonOut}`))
  }

  if (options.csvOut !== undefined) {
    const rows = keys.length > 0 ? keys : toModRows(output.mods)
    const written = await writeKeyCsv(options.csvOut, rows, nodeFs)
    console.log(dim(`  csv  → ${options.csvOut} (${num(written.rows)} rows)`))
  }
}

export function toModRows(mods: readonly ScannedMod[]): KeyReport[] {
  return mods.flatMap(mod =>
    Object.keys(mod.missingKeys).flatMap(languageRaw => {
      const language = languageRaw as keyof typeof mod.missingKeys
      return [
        {
          modId: mod.id,
          modName: mod.name,
          language,
          key: '',
          file: mod.path,
          source: '',
          state: 'missing' as const,
          reason:
            `${mod.missingKeys[language] ?? 0} missing, ` +
            `${mod.coveredKeys[language] ?? 0} covered, ` +
            `${mod.englishKeys[language] ?? 0} in the source language`
        }
      ]
    })
  )
}
