// Both spellings covered so the truncation works across Paradox games
// (CK3 / EU5 / Imperator / Vic3 use "localization", others use "localisation").
const LOCALISATION_DIRS = new Set(['localisation', 'localization'])

/**
 * Trims long paths around the localisation segment. Example:
 *   `C:/Steam/.../localisation/english/foo_l_english.yml` keeps
 *   the first 2 segments + everything from 2 above the localisation dir.
 */
export function formatPath(path: string): string {
  const segments = path.split('/')
  const locIdx = segments.findIndex(s => LOCALISATION_DIRS.has(s.toLowerCase()))

  if (locIdx !== -1) {
    const headEnd = 2
    const tailStart = Math.max(0, locIdx - 2)
    if (tailStart > headEnd) {
      const head = segments.slice(0, headEnd).join('/')
      const tail = segments.slice(tailStart).join('/')
      return `${head}/…/${tail}`
    }
    return path
  }

  // Generic fallback: keep the 2 first and 3 last segments if path has > 6 segments
  if (segments.length > 6) {
    const head = segments.slice(0, 2).join('/')
    const tail = segments.slice(-3).join('/')
    return `${head}/…/${tail}`
  }
  return path
}
