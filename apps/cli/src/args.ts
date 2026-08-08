/**
 * Command line parsing.
 *
 * Ported from PR #4 (e21ee7a, `src/cli/options.ts` `parseArgs`) by Artem Kondrashev, quirks and
 * all: `-x` and `--x` are the same flag, and a value-less flag followed by a single-dash token
 * swallows it as its value, because only `--` is recognised as the start of the next switch. Both
 * are documented rather than fixed, so a config that worked before keeps working.
 */

export interface Args {
  command: string
  flags: Record<string, string | boolean>
  rest: string[]
}

/**
 * Parse `--flag value`, `--flag=value` and `--switch`.
 * @param argv - The arguments, without node and the script
 * @returns The command and its flags
 */
export function parseArgs(argv: readonly string[]): Args {
  const flags: Record<string, string | boolean> = {}
  const rest: string[] = []
  let command = ''

  for (let index = 0; index < argv.length; index++) {
    const item = argv[index]
    if (item === undefined) continue

    if (!item.startsWith('-')) {
      if (command) rest.push(item)
      else command = item
      continue
    }

    const name = item.replace(/^-+/, '')
    const equals = name.indexOf('=')
    if (equals !== -1) {
      flags[name.slice(0, equals)] = name.slice(equals + 1)
      continue
    }

    const next = argv[index + 1]
    // Only `--` counts as the next switch, so `--json -x` reads `-x` as the value of `--json`.
    if (next === undefined || next.startsWith('--')) {
      flags[name] = true
      continue
    }
    flags[name] = next
    index++
  }

  return { command, flags, rest }
}
