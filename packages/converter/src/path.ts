/**
 * True for a rooted POSIX path.
 *
 * Windows paths start with a drive letter (`C:/...`) and are not rooted in this sense: they
 * carry no leading separator, which is why the absoluteness bugs this guards against only
 * ever showed up on macOS and Linux.
 */
export function posixIsAbsolute(path: string): boolean {
  return path.replaceAll('\\', '/').startsWith('/')
}

/**
 * Rebuild a path from segments taken out of `source`, carrying its root separator.
 *
 * `posixSplit` drops empty segments, so an absolute path put back together with a plain
 * `join('/')` silently comes back relative, and everything composed on top of it is resolved
 * against the process cwd instead of the folder it came from. Any code that splits a path and
 * rejoins part of it goes through here.
 */
export function posixRejoin(source: string, segments: string[]): string {
  return rooted(posixIsAbsolute(source), segments)
}

function rooted(isAbsolute: boolean, segments: string[]): string {
  return (isAbsolute ? '/' : '') + segments.join('/')
}

export function posixJoin(...parts: string[]): string {
  const segments: string[] = []
  let isAbsolute = false
  let seenFirst = false
  for (const raw of parts) {
    if (raw.length === 0) continue
    const cleaned = raw.replaceAll('\\', '/')
    // The first non-empty part decides rootedness, and its leading separator is then carried
    // by `rooted` rather than by the segment: a lone '/' trims to nothing and used to take the
    // root with it.
    if (!seenFirst) {
      seenFirst = true
      isAbsolute = cleaned.startsWith('/')
    }
    const trimmed = cleaned.replace(/^\/+/, '').replace(/\/+$/, '')
    if (trimmed.length > 0) segments.push(trimmed)
  }
  return rooted(isAbsolute, segments)
}

export function posixDirname(path: string): string {
  const normalized = path.replaceAll('\\', '/')
  const idx = normalized.lastIndexOf('/')
  if (idx === -1) return ''
  return normalized.slice(0, idx)
}

export function posixBasename(path: string): string {
  const normalized = path.replaceAll('\\', '/')
  const idx = normalized.lastIndexOf('/')
  return idx === -1 ? normalized : normalized.slice(idx + 1)
}

export function posixSplit(path: string): string[] {
  return path
    .replaceAll('\\', '/')
    .split('/')
    .filter(p => p.length > 0)
}

/**
 * Comparable form of a path: same separator, same case.
 *
 * Identity comparison of paths that are already well formed, so `.` and `..` are left alone
 * on purpose: routing this through `posixNormalize` would silently change what compares equal.
 *
 * Ported from PR #4 (e21ee7a, `src/main/translateFn/index.ts` `pathKey`) by Artem Kondrashev.
 */
export function pathKey(path: string): string {
  return path.replace(/[\\/]+/g, '/').toLowerCase()
}

/**
 * Resolves `.` and `..` segments. Surplus `..` are preserved at the start
 * of relative paths so callers can detect escape attempts.
 */
export function posixNormalize(path: string): string {
  const norm = path.replaceAll('\\', '/')
  const isAbs = posixIsAbsolute(norm)
  const segs = norm.split('/').filter(s => s.length > 0)
  const out: string[] = []
  for (const s of segs) {
    if (s === '.') continue
    if (s === '..') {
      if (out.length > 0 && out[out.length - 1] !== '..') {
        out.pop()
      } else if (!isAbs) {
        out.push('..')
      }
      continue
    }
    out.push(s)
  }
  return rooted(isAbs, out)
}

/** Throws if any `.` or `..` segment is present. */
export function posixNormalizeStrict(path: string): string {
  const norm = path.replaceAll('\\', '/')
  const segs = posixSplit(norm)
  if (segs.some(s => s === '..' || s === '.')) {
    throw new Error(`Path traversal segment in: ${path}`)
  }
  return posixRejoin(norm, segs)
}

/** True iff `child` is `parent` itself or a descendant after normalisation. */
export function posixContains(parent: string, child: string): boolean {
  const p = posixNormalize(parent)
  const c = posixNormalize(child)
  if (p === c) return true
  if (p === '') return !c.startsWith('..')
  return c.startsWith(`${p}/`)
}
