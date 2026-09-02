import type { Args } from './args.js'
import { parseArgs } from './args.js'
import { commandAudit } from './commands/audit.js'
import { commandConvert } from './commands/convert.js'
import { commandMemory } from './commands/memory.js'
import { commandProvider } from './commands/provider.js'
import { commandReports } from './commands/reports.js'
import { commandScan } from './commands/scan.js'
import { help } from './help.js'
import { buildOptions, type CliOptions } from './options.js'
import { clearTicker, dim, red } from './output.js'

type Command = (options: CliOptions, args: Args) => Promise<void>

const COMMANDS: Record<string, Command> = {
  scan: commandScan,
  audit: commandAudit,
  convert: commandConvert,
  provider: commandProvider,
  memory: commandMemory,
  reports: commandReports
}

const MS_PER_SECOND = 1000

export async function run(argv: readonly string[]): Promise<number> {
  const args = parseArgs(argv)

  if (!args.command || args.flags.help === true || args.flags.h === true) {
    console.log(help())
    return 0
  }

  const command = COMMANDS[args.command]
  if (!command) {
    console.error(red(`Unknown command "${args.command}"`))
    console.log(help())
    return 1
  }

  const started = Date.now()
  await command(buildOptions(args), args)
  console.log(dim(`\n  done in ${((Date.now() - started) / MS_PER_SECOND).toFixed(1)} s`))
  return 0
}

export async function main(): Promise<void> {
  try {
    process.exitCode = await run(process.argv.slice(2))
  } catch (err) {
    clearTicker()
    console.error(`\n${red('error')} ${err instanceof Error ? err.message : String(err)}`)
    if (process.env.PTT_DEBUG && err instanceof Error) console.error(err.stack)
    process.exitCode = 1
  }
}
