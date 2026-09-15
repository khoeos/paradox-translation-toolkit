import { mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { canonicalize, isCriticalFolder, isWellKnownParadoxPath } from './path-policy.js'

const probeSymlinkSupport = (): boolean => {
  const probe = mkdtempSync(join(tmpdir(), 'ptt-path-policy-probe-'))
  try {
    symlinkSync(probe, join(probe, 'link'), 'dir')
    return true
  } catch {
    return false
  } finally {
    rmSync(probe, { recursive: true, force: true })
  }
}

const canSymlink = probeSymlinkSupport()

const criticalTargetForCurrentPlatform = (): string | null => {
  if (process.platform === 'win32') return 'C:\\Windows'
  if (process.platform === 'darwin') return '/System'
  if (process.platform === 'linux') return '/etc'
  return null
}

describe('canonicalize', () => {
  it('resolves relative segments', () => {
    expect(canonicalize('foo/./bar/../baz').endsWith('foo/baz')).toBe(true)
  })

  it('does not throw on a path that does not exist yet', () => {
    const missing = join(tmpdir(), 'ptt-path-policy-does-not-exist', 'nested', 'nope')
    expect(() => canonicalize(missing)).not.toThrow()
  })

  it('does not resolve a fully nonexistent path under an anodyne existing ancestor as critical', () => {
    const missing = join(tmpdir(), 'ptt-path-policy-nonexistent-anodyne-xyz', 'nested')
    expect(isCriticalFolder(missing)).toBe(false)
  })

  describe.runIf(canSymlink)('with a nonexistent leaf under a symlinked ancestor', () => {
    it('still resolves the symlinked ancestor and detects the critical target', () => {
      const target = criticalTargetForCurrentPlatform()
      if (target === null) return
      const dir = mkdtempSync(join(tmpdir(), 'ptt-path-policy-symlink-nonexistent-'))
      const link = join(dir, 'link')
      symlinkSync(target, link, 'dir')
      try {
        const nonexistentUnderLink = join(link, 'does-not-exist-xyz123', 'nested')
        expect(isCriticalFolder(nonexistentUnderLink)).toBe(true)
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    })
  })
})

describe.runIf(canSymlink)('isCriticalFolder through a symlink', () => {
  it('detects a critical folder reached via a symlinked directory', () => {
    const target = criticalTargetForCurrentPlatform()
    if (target === null) return
    const dir = mkdtempSync(join(tmpdir(), 'ptt-path-policy-symlink-'))
    const link = join(dir, 'link')
    symlinkSync(target, link, 'dir')
    try {
      expect(isCriticalFolder(link)).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('isWellKnownParadoxPath', () => {
  it('accepts paths under "Paradox Interactive"', () => {
    expect(
      isWellKnownParadoxPath('C:\\Users\\conta\\Documents\\Paradox Interactive\\Stellaris\\mod')
    ).toBe(true)
  })

  it('accepts paths matching a game displayName segment with spaces', () => {
    expect(
      isWellKnownParadoxPath(
        'C:\\Users\\conta\\Documents\\Paradox Interactive\\Hearts of Iron IV\\mod'
      )
    ).toBe(true)
  })

  it('accepts Steam Workshop layout via consecutive workshop/content segments', () => {
    expect(isWellKnownParadoxPath('H:\\SteamLibrary\\steamapps\\workshop\\content\\281990')).toBe(
      true
    )
  })

  it('accepts paths matching a Steam app id segment', () => {
    // 281990 is Stellaris's appId
    expect(isWellKnownParadoxPath('H:/games/281990/raw')).toBe(true)
  })

  it('accepts paths matching a localisation dir segment', () => {
    expect(isWellKnownParadoxPath('D:/some/random/path/localisation/foo')).toBe(true)
    expect(isWellKnownParadoxPath('D:/some/random/path/localization/foo')).toBe(true)
  })

  it('accepts paths matching a language file token segment', () => {
    // "english", "braz_por", "simp_chinese" are tokens
    expect(isWellKnownParadoxPath('D:/foo/english/bar')).toBe(true)
    expect(isWellKnownParadoxPath('D:/foo/braz_por/bar')).toBe(true)
    expect(isWellKnownParadoxPath('D:/foo/simp_chinese/bar')).toBe(true)
  })

  it('rejects substring-only matches that are not a full segment', () => {
    expect(isWellKnownParadoxPath('C:/my_stellaris_backup/foo')).toBe(false)
    expect(isWellKnownParadoxPath('C:/englishdocs/notes')).toBe(false)
  })

  it('rejects unrelated user folders', () => {
    expect(isWellKnownParadoxPath('C:/Users/foo/Desktop/random')).toBe(false)
    expect(isWellKnownParadoxPath('D:/dev/my-mod-repo')).toBe(false)
  })
})

describe('isCriticalFolder', () => {
  describe.runIf(process.platform === 'win32')('on win32', () => {
    it('refuses C:\\Windows and descendants', () => {
      expect(isCriticalFolder('C:\\Windows')).toBe(true)
      expect(isCriticalFolder('C:\\Windows\\System32')).toBe(true)
    })

    it('refuses Program Files / ProgramData ROOTS but allows descendants', () => {
      expect(isCriticalFolder('C:\\Program Files')).toBe(true)
      expect(isCriticalFolder('C:\\Program Files (x86)')).toBe(true)
      expect(isCriticalFolder('C:\\ProgramData')).toBe(true)
      // Descendants are legitimate (Steam, GoG, etc. install here).
      expect(isCriticalFolder('C:\\Program Files\\Steam')).toBe(false)
      expect(
        isCriticalFolder('C:\\Program Files (x86)\\Steam\\steamapps\\workshop\\content\\281990')
      ).toBe(false)
      expect(isCriticalFolder('C:\\ProgramData\\Paradox Interactive')).toBe(false)
    })

    it('refuses bare drive root and C:\\Users root, allows user descendants', () => {
      expect(isCriticalFolder('C:\\')).toBe(true)
      expect(isCriticalFolder('D:\\')).toBe(true)
      expect(isCriticalFolder('C:\\Users')).toBe(true)
      expect(isCriticalFolder('C:\\Users\\someone\\Documents\\stuff')).toBe(false)
    })
  })

  describe.runIf(process.platform === 'darwin')('on darwin', () => {
    it('refuses /System and descendants (deep block)', () => {
      expect(isCriticalFolder('/System')).toBe(true)
      expect(isCriticalFolder('/System/Library/Foo')).toBe(true)
    })

    it('refuses /Applications, /Users, /Library ROOTS only', () => {
      expect(isCriticalFolder('/Applications')).toBe(true)
      expect(isCriticalFolder('/Users')).toBe(true)
      expect(isCriticalFolder('/Library')).toBe(true)
      // Descendants legitimate (apps store data under /Library/Application Support, etc.)
      expect(isCriticalFolder('/Library/Application Support/Steam')).toBe(false)
      expect(isCriticalFolder('/Applications/Steam.app/Contents')).toBe(false)
      expect(isCriticalFolder('/Users/foo/Documents/mods')).toBe(false)
    })

    it('exempts /private/var and /private/tmp from the /private deep block', () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'ptt-path-policy-mac-tmp-'))
      try {
        expect(isCriticalFolder(tempDir)).toBe(false)
      } finally {
        rmSync(tempDir, { recursive: true, force: true })
      }
      expect(isCriticalFolder('/tmp')).toBe(false)
    })

    it('still refuses /etc, keeping the fix for the deep-block gap it closed', () => {
      expect(isCriticalFolder('/etc')).toBe(true)
    })

    it('still refuses /private itself and the rest of the deep block', () => {
      expect(isCriticalFolder('/private')).toBe(true)
    })

    it('does not exempt by bare string prefix of /private/var', () => {
      expect(isCriticalFolder('/private/variable')).toBe(true)
      expect(isCriticalFolder('/private/variable/foo')).toBe(true)
    })

    it('narrows the /private/var exemption to /private/var/folders, keeping the rest of /private/var critical', () => {
      expect(isCriticalFolder('/private/var')).toBe(true)
      expect(isCriticalFolder('/private/var/root')).toBe(true)
      expect(isCriticalFolder('/private/var/db/dslocal')).toBe(true)
    })
  })

  describe.runIf(process.platform === 'linux')('on linux', () => {
    it('refuses /etc, /usr, /boot deeply', () => {
      expect(isCriticalFolder('/etc')).toBe(true)
      expect(isCriticalFolder('/etc/passwd')).toBe(true)
      expect(isCriticalFolder('/usr/local')).toBe(true)
      expect(isCriticalFolder('/boot')).toBe(true)
    })

    it('refuses /home and /var ROOTS only', () => {
      expect(isCriticalFolder('/home')).toBe(true)
      expect(isCriticalFolder('/var')).toBe(true)
      // Descendants OK (Steam under /var/lib/Steam, user home descendants).
      expect(isCriticalFolder('/home/foo/mods')).toBe(false)
      expect(isCriticalFolder('/var/lib/Steam/steamapps/workshop/content/281990')).toBe(false)
    })
  })
})

describe('integration: golden user paths', () => {
  it('real-world Paradox paths from the user are accepted (well-known + non-critical)', () => {
    const paths = [
      'C:\\Users\\conta\\Documents\\Paradox Interactive\\Stellaris\\mod\\test-ptt-stellaris',
      'C:\\Users\\conta\\Documents\\Paradox Interactive\\Hearts of Iron IV\\mod',
      'H:\\SteamLibrary\\steamapps\\workshop\\content\\281990'
    ]
    for (const p of paths) {
      expect(isWellKnownParadoxPath(p)).toBe(true)
      expect(isCriticalFolder(p)).toBe(false)
    }
  })

  // Regression : `C:\Program Files (x86)\Steam\steamapps\workshop\content\...`
  // used to be hard-blocked by the critical-folder check, breaking the
  // default Steam install layout. Descendants of Program Files must be
  // reachable so Workshop subscriptions work without the user having to
  // first move Steam off the system drive.
  describe.runIf(process.platform === 'win32')('Steam under Program Files', () => {
    it('Workshop content under Program Files (x86) is non-critical and well-known', () => {
      const p = 'C:\\Program Files (x86)\\Steam\\steamapps\\workshop\\content\\281990\\3170396896'
      expect(isCriticalFolder(p)).toBe(false)
      expect(isWellKnownParadoxPath(p)).toBe(true)
    })
  })
})
