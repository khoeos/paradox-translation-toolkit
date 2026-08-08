import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { nodeFs } from '../src/index.js'

/**
 * The adapter runs against a real temporary directory: it is the seam between the FS-agnostic
 * cores and the actual filesystem, so a fake here would test nothing.
 */
let dir = ''

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'ptt-fs-node-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('nodeFs - files', () => {
  it('writes and reads back utf-8', async () => {
    const path = join(dir, 'a.yml')
    await nodeFs.writeFile(path, 'héllo ﻿', 'utf-8')
    expect(await nodeFs.readFile(path, 'utf-8')).toBe('héllo ﻿')
  })

  it('throws when reading a file that is not there', async () => {
    await expect(nodeFs.readFile(join(dir, 'nope'), 'utf-8')).rejects.toThrow()
  })

  it('renames', async () => {
    await nodeFs.writeFile(join(dir, 'a'), 'x', 'utf-8')
    await nodeFs.rename(join(dir, 'a'), join(dir, 'b'))
    expect(await nodeFs.exists(join(dir, 'a'))).toBe(false)
    expect(await nodeFs.readFile(join(dir, 'b'), 'utf-8')).toBe('x')
  })

  it('copies', async () => {
    await nodeFs.writeFile(join(dir, 'a'), 'x', 'utf-8')
    await nodeFs.copyFile(join(dir, 'a'), join(dir, 'b'))
    expect(await nodeFs.readFile(join(dir, 'a'), 'utf-8')).toBe('x')
    expect(await nodeFs.readFile(join(dir, 'b'), 'utf-8')).toBe('x')
  })

  it('unlinks', async () => {
    await nodeFs.writeFile(join(dir, 'a'), 'x', 'utf-8')
    await nodeFs.unlink(join(dir, 'a'))
    expect(await nodeFs.exists(join(dir, 'a'))).toBe(false)
  })
})

describe('nodeFs - directories', () => {
  it('creates a nested directory', async () => {
    await nodeFs.mkdir(join(dir, 'a/b/c'), { recursive: true })
    expect((await nodeFs.stat(join(dir, 'a/b/c'))).isDirectory).toBe(true)
  })

  it('is happy creating a directory that exists', async () => {
    await nodeFs.mkdir(join(dir, 'a'), { recursive: true })
    await expect(nodeFs.mkdir(join(dir, 'a'), { recursive: true })).resolves.toBeUndefined()
  })

  it('lists entries with their kind', async () => {
    await nodeFs.mkdir(join(dir, 'sub'), { recursive: true })
    await nodeFs.writeFile(join(dir, 'file.yml'), 'x', 'utf-8')
    const entries = await nodeFs.readdir(dir)
    const byName = new Map(entries.map(e => [e.name, e]))
    expect(byName.get('sub')?.isDirectory).toBe(true)
    expect(byName.get('file.yml')?.isFile).toBe(true)
  })

  it('flags a symlink, which the walker refuses to follow', async () => {
    // A mod is untrusted content: the cores rely on this flag to keep a write in its sandbox.
    await writeFile(join(dir, 'target'), 'x')
    await symlink(join(dir, 'target'), join(dir, 'link'))
    const entries = await nodeFs.readdir(dir)
    expect(entries.find(e => e.name === 'link')?.isSymlink).toBe(true)
  })

  it('throws when listing a directory that is not there', async () => {
    await expect(nodeFs.readdir(join(dir, 'nope'))).rejects.toThrow()
  })
})

describe('nodeFs - stat and exists', () => {
  it('reports the byte size, not the character count', async () => {
    await nodeFs.writeFile(join(dir, 'a'), 'é', 'utf-8')
    expect((await nodeFs.stat(join(dir, 'a'))).size).toBe(2)
  })

  it('throws on stat of a missing path', async () => {
    await expect(nodeFs.stat(join(dir, 'nope'))).rejects.toThrow()
  })

  it('answers false rather than throwing for a missing path', async () => {
    expect(await nodeFs.exists(join(dir, 'nope'))).toBe(false)
  })

  it('answers true for a directory as well as a file', async () => {
    expect(await nodeFs.exists(dir)).toBe(true)
    await nodeFs.writeFile(join(dir, 'a'), 'x', 'utf-8')
    expect(await nodeFs.exists(join(dir, 'a'))).toBe(true)
  })
})

describe('nodeFs - round trip through the real filesystem', () => {
  it('preserves a BOM and CRLF exactly', async () => {
    // The parser's round-trip guarantee is worthless if the adapter normalises anything.
    const content = '﻿l_english:\r\n KEY:0 "value"\r\n'
    const path = join(dir, 'bom_l_english.yml')
    await nodeFs.writeFile(path, content, 'utf-8')
    expect(await nodeFs.readFile(path, 'utf-8')).toBe(content)
    expect(await readFile(path, 'utf-8')).toBe(content)
  })
})
