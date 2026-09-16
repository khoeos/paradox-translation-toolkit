// Both spellings covered so the truncation works across Paradox games
// (CK3 / EU5 / Imperator / Vic3 use "localization", others use "localisation").
export const LOCALISATION_DIRS = new Set(['localisation', 'localization'])
const PATH_SEPARATORS = /\\/g
const HEAD_SEGMENT_COUNT = 2
const GENERIC_TAIL_SEGMENT_COUNT = 3
const GENERIC_FALLBACK_MIN_SEGMENTS = 6
export const TRUNCATION_ELLIPSIS = '…'

export interface FormatPathParts {
  head: string
  tail: string
  truncated: boolean
}

/**
 * Splits a path into the segments kept around the localisation dir (or the
 * generic head/tail fallback), without baking the truncation marker into the
 * text so callers can tell a real elision apart from a literal `…` segment.
 * Example:
 *   `C:/Steam/.../localisation/english/foo_l_english.yml` keeps
 *   the first 2 segments + everything from 2 above the localisation dir.
 */
export const formatPathParts = (path: string): FormatPathParts => {
  const normalized = path.replace(PATH_SEPARATORS, '/')
  const segments = normalized.split('/')
  const locIdx = segments.findIndex(segment => LOCALISATION_DIRS.has(segment.toLowerCase()))

  if (locIdx !== -1) {
    const headEnd = HEAD_SEGMENT_COUNT
    const tailStart = Math.max(0, locIdx - HEAD_SEGMENT_COUNT)
    if (tailStart > headEnd) {
      return {
        head: segments.slice(0, headEnd).join('/'),
        tail: segments.slice(tailStart).join('/'),
        truncated: true
      }
    }
    return { head: '', tail: normalized, truncated: false }
  }

  if (segments.length > GENERIC_FALLBACK_MIN_SEGMENTS) {
    return {
      head: segments.slice(0, HEAD_SEGMENT_COUNT).join('/'),
      tail: segments.slice(-GENERIC_TAIL_SEGMENT_COUNT).join('/'),
      truncated: true
    }
  }
  return { head: '', tail: normalized, truncated: false }
}

export const formatPath = (path: string): string => {
  const { head, tail, truncated } = formatPathParts(path)
  return truncated ? `${head}/${TRUNCATION_ELLIPSIS}/${tail}` : tail
}
