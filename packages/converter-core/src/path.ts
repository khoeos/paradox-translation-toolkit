export function posixJoin(...parts: string[]): string {
  if (parts.length === 0) return ''
  const segments: string[] = []
  for (let i = 0; i < parts.length; i++) {
    const raw = parts[i] ?? ''
    if (raw.length === 0) continue
    let cleaned = raw.replaceAll('\\', '/')
    if (i > 0) cleaned = cleaned.replace(/^\/+/, '')
    cleaned = cleaned.replace(/\/+$/, '')
    if (cleaned.length > 0) segments.push(cleaned)
  }
  return segments.join('/')
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
 * Resolves `.` and `..` segments. Surplus `..` are preserved at the start
 * of relative paths so callers can detect escape attempts.
 */
export function posixNormalize(path: string): string {
  const norm = path.replaceAll('\\', '/')
  const isAbs = norm.startsWith('/')
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
  return (isAbs ? '/' : '') + out.join('/')
}

/** Throws if any `.` or `..` segment is present. */
export function posixNormalizeStrict(path: string): string {
  const norm = path.replaceAll('\\', '/')
  const isAbs = norm.startsWith('/')
  const segs = posixSplit(norm)
  if (segs.some(s => s === '..' || s === '.')) {
    throw new Error(`Path traversal segment in: ${path}`)
  }
  return (isAbs ? '/' : '') + segs.join('/')
}

/** True iff `child` is `parent` itself or a descendant after normalisation. */
export function posixContains(parent: string, child: string): boolean {
  const p = posixNormalize(parent)
  const c = posixNormalize(child)
  if (p === c) return true
  if (p === '') return !c.startsWith('..')
  return c.startsWith(`${p}/`)
}
