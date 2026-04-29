import { describe, expect, it } from 'vitest'

import { parse } from '@ptt/parser-core'

import { apply } from '../src/apply.js'
import { diff } from '../src/diff.js'
import { plan } from '../src/plan.js'
import { scan } from '../src/scan.js'
import type { ProgressEvent } from '../src/types.js'
import { localeFile, stellarisDef } from './fixtures.js'
import { MemoryFs } from './memory-fs.js'

async function runFullPipeline(
  initial: Record<string, string>,
  targetLangs: ('fr' | 'de' | 'zh-Hans' | 'pt-BR')[]
) {
  const fs = new MemoryFs(initial)
  const scanResult = await scan('workshop', stellarisDef, fs)
  const diffPlan = diff(scanResult, 'en', targetLangs)
  const copyPlan = plan(diffPlan, { mode: 'add-to-current', gameDef: stellarisDef })
  const report = await apply(copyPlan, fs)
  return { fs, scanResult, diffPlan, copyPlan, report }
}

describe('apply - basic copy', () => {
  it('creates the target file', async () => {
    const { fs, report } = await runFullPipeline(
      {
        'workshop/mod/localisation/english/foo_l_english.yml': localeFile('english', [
          ['HELLO', 'world']
        ])
      },
      ['fr']
    )
    expect(report.created.fr).toEqual(['workshop/mod/localisation/french/foo_l_french.yml'])
    expect(await fs.exists('workshop/mod/localisation/french/foo_l_french.yml')).toBe(true)
  })

  it('rewrites the language header in the file content', async () => {
    const { fs } = await runFullPipeline(
      {
        'workshop/mod/localisation/english/foo_l_english.yml': localeFile('english', [
          ['HELLO', 'world']
        ])
      },
      ['fr']
    )
    const content = await fs.readFile('workshop/mod/localisation/french/foo_l_french.yml', 'utf-8')
    expect(content).toContain('l_french:')
    expect(content).not.toContain('l_english:')
  })

  it('preserves the BOM in the output file', async () => {
    const { fs } = await runFullPipeline(
      {
        'workshop/mod/localisation/english/foo_l_english.yml': localeFile('english', [['KEY', 'v']])
      },
      ['fr']
    )
    const content = await fs.readFile('workshop/mod/localisation/french/foo_l_french.yml', 'utf-8')
    expect(content.charCodeAt(0)).toBe(0xfeff)
  })

  it('preserves entries verbatim across the copy', async () => {
    const { fs } = await runFullPipeline(
      {
        'workshop/mod/localisation/english/foo_l_english.yml': localeFile('english', [
          ['HELLO', 'world'],
          ['ANOTHER', 'value with §Yyellow§!']
        ])
      },
      ['de']
    )
    const out = await fs.readFile('workshop/mod/localisation/german/foo_l_german.yml', 'utf-8')
    const parsed = parse(out)
    expect(parsed.file.language).toBe('german')
    expect(parsed.file.entries).toHaveLength(2)
    expect(parsed.file.entries[0]).toMatchObject({ key: 'HELLO', value: 'world' })
    expect(parsed.file.entries[1]?.value).toBe('value with §Yyellow§!')
  })
})

describe('apply - idempotence', () => {
  it('does not overwrite existing target files', async () => {
    const fs = new MemoryFs({
      'workshop/mod/localisation/english/foo_l_english.yml': localeFile('english'),
      'workshop/mod/localisation/french/foo_l_french.yml': 'PRE-EXISTING CONTENT'
    })
    const scanResult = await scan('workshop', stellarisDef, fs)
    const diffPlan = diff(scanResult, 'en', ['fr'])
    const copyPlan = plan(diffPlan, { mode: 'add-to-current', gameDef: stellarisDef })
    await apply(copyPlan, fs)
    const content = await fs.readFile('workshop/mod/localisation/french/foo_l_french.yml', 'utf-8')
    expect(content).toBe('PRE-EXISTING CONTENT')
  })

  it('two consecutive runs produce no new writes on the second', async () => {
    const fs = new MemoryFs({
      'workshop/mod/localisation/english/foo_l_english.yml': localeFile('english')
    })
    const def = stellarisDef
    // First run
    let s = await scan('workshop', def, fs)
    let d = diff(s, 'en', ['fr'])
    await apply(plan(d, { mode: 'add-to-current', gameDef: def }), fs)
    // Second run
    s = await scan('workshop', def, fs)
    d = diff(s, 'en', ['fr'])
    expect(d.missingFiles.fr).toBeUndefined()
  })
})

describe('apply - overwrite', () => {
  it('replaces an existing target file when overwrite is true', async () => {
    const fs = new MemoryFs({
      'workshop/mod/localisation/english/foo_l_english.yml': localeFile('english', [
        ['HELLO', 'world']
      ]),
      'workshop/mod/localisation/french/foo_l_french.yml': 'STALE'
    })
    const scanResult = await scan('workshop', stellarisDef, fs)
    const diffPlan = diff(scanResult, 'en', ['fr'], { overwrite: true })
    const copyPlan = plan(diffPlan, { mode: 'add-to-current', gameDef: stellarisDef })
    const report = await apply(copyPlan, fs, { overwrite: true })

    const content = await fs.readFile('workshop/mod/localisation/french/foo_l_french.yml', 'utf-8')
    expect(content).toContain('l_french:')
    expect(content).not.toBe('STALE')
    expect(report.overwritten.fr).toEqual(['workshop/mod/localisation/french/foo_l_french.yml'])
    expect(report.created.fr).toBeUndefined()
  })

  it('still counts brand-new files as created when overwrite is true', async () => {
    const fs = new MemoryFs({
      'workshop/mod/localisation/english/foo_l_english.yml': localeFile('english')
    })
    const scanResult = await scan('workshop', stellarisDef, fs)
    const diffPlan = diff(scanResult, 'en', ['fr'], { overwrite: true })
    const copyPlan = plan(diffPlan, { mode: 'add-to-current', gameDef: stellarisDef })
    const report = await apply(copyPlan, fs, { overwrite: true })

    expect(report.created.fr).toHaveLength(1)
    expect(report.overwritten.fr).toBeUndefined()
  })
})

describe('apply - error handling', () => {
  it('reports failed actions when source is unreadable', async () => {
    const fs = new MemoryFs({
      'workshop/mod/localisation/english/foo_l_english.yml': localeFile('english')
    })
    const scanResult = await scan('workshop', stellarisDef, fs)
    const diffPlan = diff(scanResult, 'en', ['fr'])
    const copyPlan = plan(diffPlan, { mode: 'add-to-current', gameDef: stellarisDef })
    // Sabotage source
    const sabotaged: typeof fs = Object.assign(Object.create(Object.getPrototypeOf(fs)), fs, {
      readFile: async () => {
        throw new Error('disk failure')
      }
    })
    const report = await apply(copyPlan, sabotaged)
    expect(report.created.fr).toBeUndefined()
    expect(report.failed.fr).toHaveLength(1)
    expect(report.failed.fr?.[0]?.error).toContain('disk failure')
  })
})

describe('apply - atomicity', () => {
  it('writes via a tmp file then renames into place', async () => {
    const fs = new MemoryFs({
      'workshop/mod/localisation/english/foo_l_english.yml': localeFile('english', [['K', 'v']])
    })
    const renames: { from: string; to: string }[] = []
    const writes: string[] = []
    const wrapped: typeof fs = Object.assign(Object.create(Object.getPrototypeOf(fs)), fs, {
      writeFile: async (path: string, data: string, encoding: 'utf-8') => {
        writes.push(path)
        return fs.writeFile(path, data, encoding)
      },
      rename: async (from: string, to: string) => {
        renames.push({ from, to })
        return fs.rename(from, to)
      }
    })
    const scanResult = await scan('workshop', stellarisDef, fs)
    const copyPlan = plan(diff(scanResult, 'en', ['fr']), {
      mode: 'add-to-current',
      gameDef: stellarisDef
    })
    await apply(copyPlan, wrapped)

    const target = 'workshop/mod/localisation/french/foo_l_french.yml'
    expect(writes).toHaveLength(1)
    expect(writes[0]).not.toBe(target)
    expect(writes[0]).toMatch(/\.tmp$/)
    expect(renames).toEqual([{ from: writes[0], to: target }])
    expect(await fs.exists(target)).toBe(true)
    expect(await fs.exists(writes[0]!)).toBe(false)
  })

  it('does not leave a tmp file behind when the rename fails', async () => {
    const fs = new MemoryFs({
      'workshop/mod/localisation/english/foo_l_english.yml': localeFile('english')
    })
    const tmpPaths: string[] = []
    const wrapped: typeof fs = Object.assign(Object.create(Object.getPrototypeOf(fs)), fs, {
      writeFile: async (path: string, data: string, encoding: 'utf-8') => {
        tmpPaths.push(path)
        return fs.writeFile(path, data, encoding)
      },
      rename: async () => {
        throw new Error('rename boom')
      }
    })
    const scanResult = await scan('workshop', stellarisDef, fs)
    const copyPlan = plan(diff(scanResult, 'en', ['fr']), {
      mode: 'add-to-current',
      gameDef: stellarisDef
    })
    const report = await apply(copyPlan, wrapped)

    expect(report.failed.fr?.[0]?.error).toContain('rename boom')
    expect(tmpPaths).toHaveLength(1)
    expect(await fs.exists(tmpPaths[0]!)).toBe(false)
  })
})

describe('apply - source size cap', () => {
  it('refuses to read source files exceeding 50MB', async () => {
    const fs = new MemoryFs({
      'workshop/mod/localisation/english/foo_l_english.yml': localeFile('english')
    })
    const scanResult = await scan('workshop', stellarisDef, fs)
    const diffPlan = diff(scanResult, 'en', ['fr'])
    const copyPlan = plan(diffPlan, { mode: 'add-to-current', gameDef: stellarisDef })
    // Wrap stat to simulate a 60MB source file without holding 60MB in memory.
    const oversized: typeof fs = Object.assign(Object.create(Object.getPrototypeOf(fs)), fs, {
      stat: async (p: string) => {
        const real = await fs.stat(p)
        if (p.endsWith('foo_l_english.yml')) return { ...real, size: 60 * 1024 * 1024 }
        return real
      }
    })
    const report = await apply(copyPlan, oversized)
    expect(report.created.fr).toBeUndefined()
    expect(report.failed.fr?.[0]?.error).toMatch(/exceeds .* bytes/)
    expect(await fs.exists('workshop/mod/localisation/french/foo_l_french.yml')).toBe(false)
  })
})

describe('apply - malformed source', () => {
  it('refuses to write when the source has no language header', async () => {
    const fs = new MemoryFs({
      // No `l_english:` header - parser returns ok=false.
      'workshop/mod/localisation/english/foo_l_english.yml': ' KEY:0 "value"\n'
    })
    const scanResult = await scan('workshop', stellarisDef, fs)
    const diffPlan = diff(scanResult, 'en', ['fr'])
    const copyPlan = plan(diffPlan, { mode: 'add-to-current', gameDef: stellarisDef })
    const report = await apply(copyPlan, fs)

    expect(report.created.fr).toBeUndefined()
    expect(report.failed.fr).toHaveLength(1)
    expect(report.failed.fr?.[0]?.error).toMatch(/Parse failed/)
    expect(await fs.exists('workshop/mod/localisation/french/foo_l_french.yml')).toBe(false)
  })

  it('does not create a .bak when overwrite mode hits a parse failure', async () => {
    const fs = new MemoryFs({
      'workshop/mod/localisation/english/foo_l_english.yml': 'BROKEN CONTENT\n',
      'workshop/mod/localisation/french/foo_l_french.yml': 'PREVIOUS'
    })
    const scanResult = await scan('workshop', stellarisDef, fs)
    const diffPlan = diff(scanResult, 'en', ['fr'], { overwrite: true })
    const copyPlan = plan(diffPlan, { mode: 'add-to-current', gameDef: stellarisDef })
    const report = await apply(copyPlan, fs, { overwrite: true })

    expect(report.failed.fr).toHaveLength(1)
    // Existing target was never replaced or backed up.
    expect(await fs.readFile('workshop/mod/localisation/french/foo_l_french.yml', 'utf-8')).toBe(
      'PREVIOUS'
    )
    expect(await fs.exists('workshop/mod/localisation/french/foo_l_french.yml.bak')).toBe(false)
  })
})

describe('apply - sandbox enforcement', () => {
  it('refuses to write outside the action sandboxRoot', async () => {
    const fs = new MemoryFs({
      'workshop/mod/localisation/english/foo_l_english.yml': localeFile('english')
    })
    const scanResult = await scan('workshop', stellarisDef, fs)
    const diffPlan = diff(scanResult, 'en', ['fr'])
    const copyPlan = plan(diffPlan, { mode: 'add-to-current', gameDef: stellarisDef })
    // Tamper with the targetPath to simulate a malicious relativePath that escapes.
    const tampered = {
      ...copyPlan,
      actions: copyPlan.actions.map(a => ({
        ...a,
        targetPath: `${a.sandboxRoot}/../sensitive/foo_l_french.yml`
      }))
    }

    const report = await apply(tampered, fs)
    expect(report.created.fr).toBeUndefined()
    expect(report.failed.fr).toHaveLength(1)
    expect(report.failed.fr?.[0]?.error).toContain('outside sandbox')
    expect(await fs.exists('workshop/sensitive/foo_l_french.yml')).toBe(false)
  })
})

describe('apply - backup on overwrite', () => {
  it('saves the previous content as a .bak before overwriting', async () => {
    const fs = new MemoryFs({
      'workshop/mod/localisation/english/foo_l_english.yml': localeFile('english', [
        ['HELLO', 'world']
      ]),
      'workshop/mod/localisation/french/foo_l_french.yml': 'PREVIOUS'
    })
    const scanResult = await scan('workshop', stellarisDef, fs)
    const diffPlan = diff(scanResult, 'en', ['fr'], { overwrite: true })
    const copyPlan = plan(diffPlan, { mode: 'add-to-current', gameDef: stellarisDef })
    await apply(copyPlan, fs, { overwrite: true })

    const target = 'workshop/mod/localisation/french/foo_l_french.yml'
    const bak = `${target}.bak`
    expect(await fs.exists(bak)).toBe(true)
    expect(await fs.readFile(bak, 'utf-8')).toBe('PREVIOUS')
    expect(await fs.readFile(target, 'utf-8')).toContain('l_french:')
  })

  it('does not create a .bak when the target did not previously exist', async () => {
    const fs = new MemoryFs({
      'workshop/mod/localisation/english/foo_l_english.yml': localeFile('english')
    })
    const scanResult = await scan('workshop', stellarisDef, fs)
    const diffPlan = diff(scanResult, 'en', ['fr'], { overwrite: true })
    const copyPlan = plan(diffPlan, { mode: 'add-to-current', gameDef: stellarisDef })
    await apply(copyPlan, fs, { overwrite: true })

    expect(await fs.exists('workshop/mod/localisation/french/foo_l_french.yml.bak')).toBe(false)
  })

  it('does not leave a stray .bak when the source fails to parse (write happens before backup)', async () => {
    const fs = new MemoryFs({
      // Malformed source (missing l_<lang>: header), transformSource will throw.
      'workshop/mod/localisation/english/foo_l_english.yml': '  HELLO:0 "world"\n',
      'workshop/mod/localisation/french/foo_l_french.yml': 'PREVIOUS'
    })
    const scanResult = await scan('workshop', stellarisDef, fs)
    const diffPlan = diff(scanResult, 'en', ['fr'], { overwrite: true })
    const copyPlan = plan(diffPlan, { mode: 'add-to-current', gameDef: stellarisDef })
    const report = await apply(copyPlan, fs, { overwrite: true })

    // The action failed → bucket failed populated, no .bak created.
    expect(report.failed.fr?.length).toBeGreaterThan(0)
    expect(await fs.exists('workshop/mod/localisation/french/foo_l_french.yml.bak')).toBe(false)
    // The original target is untouched.
    expect(await fs.readFile('workshop/mod/localisation/french/foo_l_french.yml', 'utf-8')).toBe(
      'PREVIOUS'
    )
  })
})

describe('apply - progress events', () => {
  it('emits one apply-progress per action', async () => {
    const fs = new MemoryFs({
      'workshop/mod/localisation/english/a_l_english.yml': localeFile('english'),
      'workshop/mod/localisation/english/b_l_english.yml': localeFile('english')
    })
    const scanResult = await scan('workshop', stellarisDef, fs)
    const diffPlan = diff(scanResult, 'en', ['fr'])
    const copyPlan = plan(diffPlan, { mode: 'add-to-current', gameDef: stellarisDef })

    const events: ProgressEvent[] = []
    await apply(copyPlan, fs, { onProgress: e => events.push(e) })

    expect(events).toHaveLength(2)
    expect(events[0]).toEqual({ type: 'apply-progress', processed: 1, total: 2 })
    expect(events[1]).toEqual({ type: 'apply-progress', processed: 2, total: 2 })
  })
})

describe('apply - multi-language batch', () => {
  it('produces one entry per target language in created', async () => {
    const { report } = await runFullPipeline(
      {
        'workshop/mod/localisation/english/foo_l_english.yml': localeFile('english', [['K', 'v']])
      },
      ['fr', 'de', 'zh-Hans']
    )
    expect(report.created.fr).toHaveLength(1)
    expect(report.created.de).toHaveLength(1)
    expect(report.created['zh-Hans']).toHaveLength(1)
  })
})
