import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  getLinuxPackageKind,
  isAutoUpdateSupported,
  isElevatedInstallRequired
} from './updater-platform.js'

const resourcesWithPackageType = (content: string): string => {
  const dir = mkdtempSync(join(tmpdir(), 'ptt-updater-'))
  writeFileSync(join(dir, 'package-type'), content, 'utf-8')
  return dir
}

describe('getLinuxPackageKind', () => {
  it('is unknown off Linux, even with an APPIMAGE env leaking through', () => {
    expect(getLinuxPackageKind('win32', '/resources', '/app.AppImage')).toBe('unknown')
    expect(getLinuxPackageKind('darwin', '/resources', '/app.AppImage')).toBe('unknown')
  })

  it('detects an AppImage from the APPIMAGE env var', () => {
    expect(getLinuxPackageKind('linux', '/resources', '/opt/ptt.AppImage')).toBe('appimage')
  })

  it('reads the package-type marker electron-builder writes for fpm targets', () => {
    expect(getLinuxPackageKind('linux', resourcesWithPackageType('deb\n'), undefined)).toBe('deb')
    expect(getLinuxPackageKind('linux', resourcesWithPackageType('rpm'), undefined)).toBe('rpm')
  })

  it('is unknown when the marker is missing or holds an unsupported target', () => {
    expect(
      getLinuxPackageKind('linux', mkdtempSync(join(tmpdir(), 'ptt-updater-')), undefined)
    ).toBe('unknown')
    expect(getLinuxPackageKind('linux', resourcesWithPackageType('snap'), undefined)).toBe(
      'unknown'
    )
  })
})

describe('isAutoUpdateSupported', () => {
  it('is always true on Windows, where NSIS updates work unsigned', () => {
    expect(isAutoUpdateSupported('win32', 'unknown')).toBe(true)
  })

  it('is always false on macOS, where Squirrel.Mac requires a signed app', () => {
    expect(isAutoUpdateSupported('darwin', 'unknown')).toBe(false)
  })

  it('is true on Linux for every package kind electron-updater can install', () => {
    expect(isAutoUpdateSupported('linux', 'appimage')).toBe(true)
    expect(isAutoUpdateSupported('linux', 'deb')).toBe(true)
    expect(isAutoUpdateSupported('linux', 'rpm')).toBe(true)
    expect(isAutoUpdateSupported('linux', 'pacman')).toBe(true)
  })

  it('falls back to manual on Linux when the install kind is undetectable', () => {
    expect(isAutoUpdateSupported('linux', 'unknown')).toBe(false)
  })
})

describe('isElevatedInstallRequired', () => {
  it('is true for package-manager installs, which shell out through sudo', () => {
    expect(isElevatedInstallRequired('linux', 'deb')).toBe(true)
    expect(isElevatedInstallRequired('linux', 'rpm')).toBe(true)
    expect(isElevatedInstallRequired('linux', 'pacman')).toBe(true)
  })

  it('is false for an AppImage, which replaces itself in place', () => {
    expect(isElevatedInstallRequired('linux', 'appimage')).toBe(false)
  })

  it('is false off Linux', () => {
    expect(isElevatedInstallRequired('win32', 'deb')).toBe(false)
  })
})
