import { homedir } from 'node:os'
import { posix } from 'node:path'

export const resolveParadoxDataHome = (
  platform: NodeJS.Platform,
  home: string,
  documentsPath: string,
  xdgDataHome: string | undefined
): string => {
  if (platform !== 'linux') return documentsPath
  const trimmed = xdgDataHome?.trim()
  if (trimmed !== undefined && trimmed.length > 0) return trimmed
  return posix.join(home, '.local/share')
}

export const nodeParadoxDataHome = (documentsPath: string): string =>
  resolveParadoxDataHome(process.platform, homedir(), documentsPath, process.env.XDG_DATA_HOME)
