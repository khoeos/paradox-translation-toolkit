export function posixIsAbsolute(path: string): boolean {
  return path.replaceAll('\\', '/').startsWith('/')
}

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

export function pathKey(path: string): string {
  return path.replace(/[\\/]+/g, '/').toLowerCase()
}

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

export function posixNormalizeStrict(path: string): string {
  const norm = path.replaceAll('\\', '/')
  const segs = posixSplit(norm)
  if (segs.some(s => s === '..' || s === '.')) {
    throw new Error(`Path traversal segment in: ${path}`)
  }
  return posixRejoin(norm, segs)
}

export function posixContains(parent: string, child: string): boolean {
  const p = posixNormalize(parent)
  const c = posixNormalize(child)
  if (p === c) return true
  if (p === '') return !c.startsWith('..')
  return c.startsWith(`${p}/`)
}
