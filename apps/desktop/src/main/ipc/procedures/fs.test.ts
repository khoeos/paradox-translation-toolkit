import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { validatePath } from './fs.js'

describe('validatePath', () => {
  it('returns "ok" for an existing, non-critical directory', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ptt-fs-validate-path-'))
    try {
      await expect(validatePath(dir)).resolves.toBe('ok')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('returns "not-found" for a path that does not exist', async () => {
    const missing = join(tmpdir(), 'ptt-fs-validate-path-does-not-exist-xyz')
    await expect(validatePath(missing)).resolves.toBe('not-found')
  })

  it('returns "not-found" for a path that is a file, not a directory', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ptt-fs-validate-path-file-'))
    const file = join(dir, 'not-a-directory.txt')
    writeFileSync(file, 'content')
    try {
      await expect(validatePath(file)).resolves.toBe('not-found')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('returns "critical" for the user home directory, rejected on every platform', async () => {
    await expect(validatePath(homedir())).resolves.toBe('critical')
  })
})
