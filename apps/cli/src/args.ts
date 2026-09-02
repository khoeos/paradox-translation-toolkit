export interface Args {
  command: string
  flags: Record<string, string | boolean>
  rest: string[]
}

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
    if (next === undefined || next.startsWith('--')) {
      flags[name] = true
      continue
    }
    flags[name] = next
    index++
  }

  return { command, flags, rest }
}
