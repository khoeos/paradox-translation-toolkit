import { posixDirname } from '@ptt/converter'
import { nodeFs } from '@ptt/fs-node'
import { listRunReportFiles, readRunReport, writeKeyCsv } from '@ptt/report'
import type { ParsedRunReport } from '@ptt/report'

import type { Args } from '../args.js'
import type { CliOptions } from '../options.js'
import { dim, facts, num, section, table } from '../output.js'

const BYTES_PER_KB = 1024

export async function commandReports(options: CliOptions, args: Args): Promise<void> {
  section(`Run reports  ${dim(options.reportsDir)}`)

  const scanLimit = args.flags.last ? 1 : options.limit
  const { files } = await listRunReportFiles(options.reportsDir, nodeFs, { limit: scanLimit })
  if (files.length === 0) {
    console.log(dim('  no report yet, run convert first'))
    return
  }

  const chosen = args.flags.last ? files[0] : undefined
  if (chosen === undefined) {
    table(
      [{ header: 'report' }, { header: 'size', right: true }],
      await Promise.all(
        files.toReversed().map(async ({ file, jsonPath }) => {
          const stat = await nodeFs.stat(jsonPath)
          return [file, `${(stat.size / BYTES_PER_KB).toFixed(0)} KB`]
        })
      )
    )
    console.log(dim('\n  Add --last to summarise the newest one.'))
    return
  }

  const report = await readRunReport(chosen.jsonPath, nodeFs)
  section(chosen.file)
  const cancelledRow: [string, string] = ['cancelled', 'yes']
  facts([
    ['started', report.startedAt],
    ['seconds', report.seconds],
    ['path', report.request.path],
    ['mode', report.request.mode],
    ['provider', report.request.translate?.provider ?? dim('none')],
    ['files created', report.totals.created],
    ['strings translated', report.counters?.translated ?? 0],
    ['strings from memory', report.counters?.cached ?? 0],
    ['strings refused', report.counters?.failed ?? 0],
    ['keys left in the source language', report.untranslated.length],
    ...(report.cancelled === true ? [cancelledRow] : [])
  ])

  const reasons = Object.entries(report.refusalsByReason)
  if (reasons.length > 0) {
    section('Why strings were refused')
    table(
      [{ header: 'reason' }, { header: 'strings', right: true }],
      reasons.toSorted((a, b) => b[1] - a[1]).map(([reason, count]) => [reason, num(count)])
    )
  }

  section(
    `Keys left in the source language (showing ${Math.min(report.untranslated.length, options.limit)})`
  )
  table(
    [
      { header: 'mod', max: 26 },
      { header: 'key', max: 36 },
      { header: 'reason', max: 40 },
      { header: 'source value', max: 50 }
    ],
    report.untranslated
      .slice(0, options.limit)
      .map(key => [key.modName, key.key, key.reason ?? '', key.source.replace(/\s+/g, ' ')])
  )

  await writeOutputs(options, report)
}

async function writeOutputs(options: CliOptions, report: ParsedRunReport): Promise<void> {
  if (options.jsonOut !== undefined) {
    const dir = posixDirname(options.jsonOut)
    if (dir.length > 0) await nodeFs.mkdir(dir, { recursive: true })
    await nodeFs.writeFile(options.jsonOut, `${JSON.stringify(report, null, 2)}\n`, 'utf-8')
    console.log(dim(`\n  json → ${options.jsonOut}`))
  }
  if (options.csvOut !== undefined) {
    const written = await writeKeyCsv(options.csvOut, report.untranslated, nodeFs)
    console.log(dim(`  csv  → ${options.csvOut} (${num(written.rows)} rows)`))
  }
}
