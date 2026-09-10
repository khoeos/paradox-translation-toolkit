import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const AUTO_UPDATABLE_LINUX_PACKAGES = ['appimage', 'deb', 'rpm', 'pacman'] as const
const ELEVATED_INSTALL_LINUX_PACKAGES = ['deb', 'rpm', 'pacman'] as const
const PACKAGE_TYPE_MARKER = 'package-type'

export type LinuxPackageKind = (typeof AUTO_UPDATABLE_LINUX_PACKAGES)[number] | 'unknown'

export const getLinuxPackageKind = (
  platform: NodeJS.Platform,
  resourcesPath: string,
  appImagePath: string | undefined
): LinuxPackageKind => {
  if (platform !== 'linux') return 'unknown'
  if (appImagePath) return 'appimage'
  try {
    const marker = join(resourcesPath, PACKAGE_TYPE_MARKER)
    if (!existsSync(marker)) return 'unknown'
    const kind = readFileSync(marker, 'utf-8').trim()
    return AUTO_UPDATABLE_LINUX_PACKAGES.find(p => p === kind) ?? 'unknown'
  } catch {
    return 'unknown'
  }
}

export const isAutoUpdateSupported = (
  platform: NodeJS.Platform,
  linuxPackage: LinuxPackageKind
): boolean => {
  if (platform === 'win32') return true
  if (platform !== 'linux') return false
  return linuxPackage !== 'unknown'
}

export const isElevatedInstallRequired = (
  platform: NodeJS.Platform,
  linuxPackage: LinuxPackageKind
): boolean => platform === 'linux' && ELEVATED_INSTALL_LINUX_PACKAGES.some(p => p === linuxPackage)
