import { homedir } from 'node:os'
import { resolve } from 'node:path'

import { getAllGames } from '@ptt/game-registry'

/** Absolute, forward-slashed, lowercased form for path comparisons. */
export function canonicalize(p: string): string {
  return resolve(p).replaceAll('\\', '/').toLowerCase()
}

function segmentsOf(canonical: string): string[] {
  return canonical.split('/').filter(s => s.length > 0)
}

let allowedTokensCache: ReadonlySet<string> | null = null

/** Segment-level tokens marking a path as a typical Paradox install/mod location. */
function getAllowedTokens(): ReadonlySet<string> {
  if (allowedTokensCache) return allowedTokensCache
  const tokens = new Set<string>()
  tokens.add('paradox interactive')
  for (const game of getAllGames()) {
    tokens.add(game.id.toLowerCase())
    tokens.add(game.displayName.toLowerCase())
    tokens.add(game.localisationDirName)
    if (game.steamAppId !== undefined) tokens.add(String(game.steamAppId))
    for (const token of Object.values(game.languageFileToken)) {
      if (token) tokens.add(token.toLowerCase())
    }
  }
  allowedTokensCache = tokens
  return tokens
}

/**
 * True iff the path looks like a Paradox-managed location: a Steam Workshop
 * layout or a segment matching a known token.
 */
export function isWellKnownParadoxPath(absPath: string): boolean {
  const canonical = canonicalize(absPath)
  const segs = segmentsOf(canonical)
  for (let i = 0; i < segs.length - 1; i++) {
    if (segs[i] === 'workshop' && segs[i + 1] === 'content') return true
  }
  const tokens = getAllowedTokens()
  for (const seg of segs) {
    if (tokens.has(seg)) return true
  }
  return false
}

// DEEP = the path and every descendant are blocked (real system locations).
// EXACT = only the literal root is blocked, descendants fall through to the
// next policy layers (Steam, Paradox mods, etc.).
const WIN_CRITICAL_DEEP_PREFIXES = ['c:/windows', 'c:/system volume information', 'c:/$recycle.bin']
const WIN_CRITICAL_EXACT = new Set([
  'c:/users',
  'c:/program files',
  'c:/program files (x86)',
  'c:/programdata'
])

const MAC_CRITICAL_DEEP_PREFIXES = ['/system', '/private']
const MAC_CRITICAL_EXACT = new Set(['/applications', '/users', '/library'])

const LINUX_CRITICAL_DEEP_PREFIXES = [
  '/etc',
  '/usr',
  '/bin',
  '/sbin',
  '/boot',
  '/root',
  '/proc',
  '/sys',
  '/dev'
]
const LINUX_CRITICAL_EXACT = new Set(['/home', '/var'])

function isDriveRoot(canonical: string): boolean {
  // Matches "c:/", "d:/", ... or just "/"
  return /^[a-z]:\/$/.test(canonical) || canonical === '/'
}

/** True iff the path is OS-critical and must not be opened by the renderer. */
export function isCriticalFolder(absPath: string): boolean {
  const canonical = canonicalize(absPath)
  if (canonical === '') return true
  if (isDriveRoot(canonical)) return true
  if (canonical === canonicalize(homedir())) return true

  const platform = process.platform
  if (platform === 'win32') {
    if (WIN_CRITICAL_EXACT.has(canonical)) return true
    return WIN_CRITICAL_DEEP_PREFIXES.some(
      prefix => canonical === prefix || canonical.startsWith(`${prefix}/`)
    )
  }
  if (platform === 'darwin') {
    if (MAC_CRITICAL_EXACT.has(canonical)) return true
    return MAC_CRITICAL_DEEP_PREFIXES.some(
      prefix => canonical === prefix || canonical.startsWith(`${prefix}/`)
    )
  }
  // Linux + everything else
  if (LINUX_CRITICAL_EXACT.has(canonical)) return true
  return LINUX_CRITICAL_DEEP_PREFIXES.some(
    prefix => canonical === prefix || canonical.startsWith(`${prefix}/`)
  )
}
