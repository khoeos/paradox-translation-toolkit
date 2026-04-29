import { describe, expect, it } from 'vitest'

import { canonicalize, isCriticalFolder, isWellKnownParadoxPath } from './path-policy.js'

describe('canonicalize', () => {
  it('converts backslashes to forward slashes and lowercases', () => {
    const got = canonicalize('C:\\Users\\Foo\\Bar')
    expect(got.startsWith('c:/users/foo/bar') || got === 'c:/users/foo/bar').toBe(true)
  })

  it('resolves relative segments', () => {
    expect(canonicalize('foo/./bar/../baz').endsWith('foo/baz')).toBe(true)
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
