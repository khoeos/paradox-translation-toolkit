import { describe, expect, it } from 'vitest'

import { walkFiles } from '../src/index.js'
import { MemoryFs } from './memory-fs.js'

describe('walkFiles', () => {
  it('lists files recursively', async () => {
    const fs = new MemoryFs({
      'mod/a.yml': 'a',
      'mod/deep/b.yml': 'b',
      'mod/deep/deeper/c.yml': 'c'
    })
    const result = await walkFiles('mod', fs)
    expect(result.files.toSorted()).toEqual([
      'mod/a.yml',
      'mod/deep/b.yml',
      'mod/deep/deeper/c.yml'
    ])
  })

  it('reports every directory it visited', async () => {
    const fs = new MemoryFs({ 'mod/loc/english/a.yml': 'a' })
    const result = await walkFiles('mod', fs)
    expect(result.dirs.toSorted()).toEqual(['mod/loc', 'mod/loc/english'])
  })

  it('filters files through acceptFile on the lowercased name', async () => {
    const fs = new MemoryFs({ 'mod/a.YML': 'a', 'mod/b.txt': 'b' })
    const result = await walkFiles('mod', fs, {
      acceptFile: lowerName => lowerName.endsWith('.yml')
    })
    expect(result.files).toEqual(['mod/a.YML'])
  })

  it('does not descend into a skipped directory but still reports it', async () => {
    const fs = new MemoryFs({ 'mod/keep/a.yml': 'a', 'mod/gfx/b.yml': 'b' })
    const result = await walkFiles('mod', fs, { skipDir: lowerName => lowerName === 'gfx' })
    expect(result.files).toEqual(['mod/keep/a.yml'])
    expect(result.dirs).toContain('mod/gfx')
  })

  it('skips symlinks instead of following them', async () => {
    const fs = new MemoryFs({ 'mod/a.yml': 'a', 'mod/link/b.yml': 'b' })
    fs.seedSymlink('mod/link')
    const result = await walkFiles('mod', fs)
    expect(result.files).toEqual(['mod/a.yml'])
    expect(result.diagnostics).toEqual([
      { severity: 'error', message: expect.stringContaining('symlink') }
    ])
  })

  it('records an unreadable folder and keeps going', async () => {
    const fs = new MemoryFs({ 'mod/ok/a.yml': 'a' })
    const original = fs.readdir.bind(fs)
    fs.readdir = async path => {
      if (path === 'mod/broken') throw new Error('EACCES')
      return original(path)
    }
    fs.seedFile('mod/broken/b.yml', 'b')
    const result = await walkFiles('mod', fs)
    expect(result.files).toEqual(['mod/ok/a.yml'])
    expect(result.diagnostics).toEqual([
      { severity: 'error', message: expect.stringContaining('EACCES') }
    ])
  })

  it('returns empty results when the root itself is unreadable', async () => {
    const fs = new MemoryFs({})
    const result = await walkFiles('nowhere', fs)
    expect(result.files).toEqual([])
    expect(result.diagnostics).toHaveLength(1)
  })

  it('is deterministic across runs', async () => {
    const fs = new MemoryFs({ 'mod/b/2.yml': '2', 'mod/a/1.yml': '1', 'mod/c/3.yml': '3' })
    const first = await walkFiles('mod', fs)
    const second = await walkFiles('mod', fs)
    expect(second.files).toEqual(first.files)
  })
})
