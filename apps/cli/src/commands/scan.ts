import { sumByLanguage } from '@ptt/converter'

import { byIdAndName, filterMods } from '../filter.js'
import type { CliOptions } from '../options.js'
import { dim, num, red, section, table, yellow, green } from '../output.js'
import { printHeader, printScanTotals, runScan, writeOutputs } from './shared.js'

export async function commandScan(options: CliOptions): Promise<void> {
  printHeader(options)
  const output = await runScan(options, false)
  printScanTotals(output)

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
    console.log(dim('  Their generated files are never pruned: keys we cannot see may be real.'))
    for (const mod of broken.slice(0, options.limit)) {
      console.log(`  ${red(mod.name)}  ${dim(mod.errors[0] ?? '')}`)
    }
  }

  const shrugged = output.mods.filter(
    mod => mod.errors.length === 0 && (mod.warnings?.length ?? 0) > 0
  )
  if (shrugged.length > 0) {
    const lines = shrugged.reduce((sum, mod) => sum + (mod.warnings?.length ?? 0), 0)
    section(`Mods holding lines the game skips (${shrugged.length}, ${lines} line(s))`)
    for (const mod of shrugged.slice(0, options.limit)) {
      console.log(`  ${yellow(mod.name)}  ${dim(mod.warnings?.[0] ?? '')}`)
    }
  }

  await writeOutputs(options, output, [])
}
