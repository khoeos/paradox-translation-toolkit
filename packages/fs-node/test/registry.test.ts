import { describe, expect, it } from 'vitest'

import { nodeRegistry } from '../src/index.js'
import { parseRegQueryOutput } from '../src/registry.js'

const STEAM_OUTPUT = `
HKEY_CURRENT_USER\\Software\\Valve\\Steam
    SteamPath    REG_SZ    C:/Program Files (x86)/Steam
    SteamExe    REG_SZ    C:/Program Files (x86)/Steam/steam.exe

`

describe('parseRegQueryOutput', () => {
  it('reads a REG_SZ value whose content has spaces', () => {
    expect(parseRegQueryOutput(STEAM_OUTPUT, 'SteamPath')).toBe('C:/Program Files (x86)/Steam')
  })

  it('reads a different value from the same block', () => {
    expect(parseRegQueryOutput(STEAM_OUTPUT, 'SteamExe')).toBe(
      'C:/Program Files (x86)/Steam/steam.exe'
    )
  })

  it('reads a REG_EXPAND_SZ value', () => {
    const output = `
HKEY_LOCAL_MACHINE\\SOFTWARE\\Example
    InstallPath    REG_EXPAND_SZ    %ProgramFiles%\\Example
`
    expect(parseRegQueryOutput(output, 'InstallPath')).toBe('%ProgramFiles%\\Example')
  })

  it('reads a REG_DWORD value as its hex string form', () => {
    const output = `
HKEY_LOCAL_MACHINE\\SOFTWARE\\Example
    Enabled    REG_DWORD    0x1
`
    expect(parseRegQueryOutput(output, 'Enabled')).toBe('0x1')
  })

  it('returns undefined when the value name is absent from the output', () => {
    expect(parseRegQueryOutput(STEAM_OUTPUT, 'NotThere')).toBeUndefined()
  })

  it('returns undefined for empty output', () => {
    expect(parseRegQueryOutput('', 'SteamPath')).toBeUndefined()
  })

  it('returns undefined for malformed output', () => {
    expect(parseRegQueryOutput('not a reg query output at all', 'SteamPath')).toBeUndefined()
  })

  it('never returns an accidental empty string', () => {
    const output = `
HKEY_CURRENT_USER\\Software\\Example
    Blank    REG_SZ
`
    expect(parseRegQueryOutput(output, 'Blank')).toBeUndefined()
  })

  it('does not bleed a value from a later key block when the first block lacks it', () => {
    const output = [
      'HKEY_CURRENT_USER\\Software\\GOG.com\\Games\\1',
      '    otherName    REG_SZ    C:\\Wrong\\Game1',
      '',
      'HKEY_CURRENT_USER\\Software\\GOG.com\\Games\\2131232214',
      '    path    REG_SZ    C:\\Right\\Imperator'
    ].join('\r\n')

    expect(parseRegQueryOutput(output, 'path')).toBeUndefined()
  })

  it('matches a value name containing an embedded space', () => {
    const output = '    Steam Path    REG_SZ    C:\\SpacedName'

    expect(parseRegQueryOutput(output, 'Steam Path')).toBe('C:\\SpacedName')
  })
})

describe.runIf(process.platform !== 'win32')('nodeRegistry.readValue - non-Windows', () => {
  it('returns undefined without spawning a process', async () => {
    expect(
      await nodeRegistry.readValue('HKCU', 'Software\\Valve\\Steam', 'SteamPath')
    ).toBeUndefined()
  })
})

describe.runIf(process.platform === 'win32')('nodeRegistry.readValue - Windows', () => {
  it('reads a value that exists on every Windows machine', async () => {
    const value = await nodeRegistry.readValue(
      'HKLM',
      'SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion',
      'ProductName'
    )
    expect(typeof value).toBe('string')
  })
})
