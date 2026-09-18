import { homedir } from 'node:os'
import { posix } from 'node:path'

import type { RegistryLike } from '@ptt/shared'

import { nodeRegistry } from './registry.js'

const SHELL_FOLDERS_KEY = 'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Shell Folders'
const USER_SHELL_FOLDERS_KEY =
  'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders'
const PERSONAL_VALUE_NAME = 'Personal'
const USERPROFILE_TOKEN = '%USERPROFILE%'

const nonEmpty = (value: string | undefined): string | undefined => {
  if (value === undefined) return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

const toPosixNormalized = (value: string): string => posix.normalize(value.replaceAll('\\', '/'))

const resolveWindowsDocumentsPath = async (
  registry: RegistryLike,
  home: string
): Promise<string> => {
  const fromShellFolders = nonEmpty(
    await registry.readValue('HKCU', SHELL_FOLDERS_KEY, PERSONAL_VALUE_NAME)
  )
  if (fromShellFolders !== undefined) return toPosixNormalized(fromShellFolders)

  const fromUserShellFolders = nonEmpty(
    await registry.readValue('HKCU', USER_SHELL_FOLDERS_KEY, PERSONAL_VALUE_NAME)
  )
  if (fromUserShellFolders !== undefined) {
    return toPosixNormalized(fromUserShellFolders.replaceAll(USERPROFILE_TOKEN, home))
  }

  return posix.join(home, 'Documents')
}

export const resolveDocumentsPath = async (
  platform: NodeJS.Platform,
  home: string,
  registry: RegistryLike
): Promise<string> => {
  if (platform !== 'win32') return posix.join(home, 'Documents')
  return resolveWindowsDocumentsPath(registry, home)
}

export const nodeDocumentsPath = (): Promise<string> =>
  resolveDocumentsPath(process.platform, homedir(), nodeRegistry)
