import { sumByLanguage } from '@ptt/converter-core'

import { byIdAndName, filterMods } from '../filter.js'
import type { CliOptions } from '../options.js'
import { dim, num, red, section, table, yellow, green } from '../output.js'
import { printHeader, printScanTotals, runScan, writeOutputs } from './shared.js'

/**
 * What every mod is missing, the generated mod counted as coverage.
 *
 * Ported from PR #4 (e21ee7a, `src/cli/index.ts` `commandScan`) by Artem Kondrashev.
 */
export async function commandScan(options: CliOptions): Promise<void> {
  printHeader(options)
  const output = await runScan(options, false)
  printScanTotals(output)

  // Filtered once: `scan` used to run the same filter again for the shadowing table below.
  const matching = filterMods(output.mods, options.modFilter, byIdAndName)

  const mods = matching
    .filter(
      mod =>
        sumByLanguage(mod.missingKeys) > 0 ||
        sumByLanguage(mod.englishKeys) > 0 ||
        sumByLanguage(mod.shadowedKeys) > 0
    )
    .toSorted((a, b) => sumByLanguage(b.missingKeys) - sumByLanguage(a.missingKeys))

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
      .map(mod => [
        mod.name,
        mod.id,
        num(mod.sourceKeys),
        green(num(sumByLanguage(mod.coveredKeys))),
        yellow(num(sumByLanguage(mod.missingKeys))),
        sumByLanguage(mod.englishKeys) > 0 ? red(num(sumByLanguage(mod.englishKeys))) : dim('0'),
        sumByLanguage(mod.shadowedKeys) > 0
          ? yellow(num(sumByLanguage(mod.shadowedKeys)))
          : dim('0'),
        num(mod.missingFiles)
      ])
  )

  // Shadowing is invisible in the list above, which is sorted by what is left to do, yet it is
  // the one problem that makes the game worse than not running the tool at all.
  const shadowing = matching
    .filter(mod => sumByLanguage(mod.shadowedKeys) > 0)
    .toSorted((a, b) => sumByLanguage(b.shadowedKeys) - sumByLanguage(a.shadowedKeys))

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
        .map(mod => [
          mod.name,
          yellow(num(sumByLanguage(mod.shadowedKeys))),
          dim(mod.coveredBy.join(', ') || 'the mod itself')
        ])
    )
  }

  const broken = output.mods.filter(mod => mod.errors.length > 0)
  if (broken.length > 0) {
    section(`Mods that could not be read fully (${broken.length})`)
    for (const mod of broken.slice(0, options.limit)) {
      console.log(`  ${red(mod.name)}  ${dim(mod.errors[0] ?? '')}`)
    }
  }

  await writeOutputs(options, output, [])
}
