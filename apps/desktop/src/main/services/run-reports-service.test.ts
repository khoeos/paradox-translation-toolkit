import { TRPCError } from '@trpc/server'
import { describe, expect, it } from 'vitest'

import { MemoryFs } from '@ptt/converter/test/memory-fs'
import { stamp, writeRunReport } from '@ptt/report'
import type { RunReport } from '@ptt/report'

import { OpenableRegistry } from './openable-registry.js'
import { RunReportsService } from './run-reports-service.js'

const STARTED = Date.UTC(2026, 7, 8, 14, 37, 33)
const FINISHED = STARTED + 65_000

const report = (over: Partial<RunReport> = {}): RunReport => ({
  startedAt: STARTED,
  finishedAt: FINISHED,
  request: {
    path: 'workshop',
    game: 'stellaris',
    mode: 'create-translation-mod',
    targetContent: 'missing-keys',
    sourceLanguage: 'en',
    targetLanguages: ['ru']
  },
  totals: {
    mods: 1,
    modsWithFiles: 1,
    created: 1,
    skipped: 0,
    unchanged: 0,
    failed: 0,
    pruned: 0,
    errors: 0
  },
  mods: [
    {
      id: 'mymod',
      name: 'My Mod',
      path: 'workshop/mymod',
      localisationFiles: 1,
      sourceFiles: 1,
      createdCount: 1,
      skippedCount: 0,
      unchangedCount: 0,
      failedCount: 0,
      prunedCount: 0,
      created: { ru: ['a_l_russian.yml'] },
      errors: []
    }
  ],
  untranslated: [],
  ...over
})

const REPORTS_DIR = 'C:/userdata/reports'

async function seedReport(
  fs: MemoryFs,
  over: Partial<RunReport> = {}
): Promise<{ jsonPath: string; csvPath: string; file: string }> {
  const written = await writeRunReport(REPORTS_DIR, report(over), fs)
  if (!written) throw new Error('expected writeRunReport to succeed')
  const file = written.jsonPath.slice(REPORTS_DIR.length + 1)
  return { jsonPath: written.jsonPath, csvPath: written.csvPath, file }
}

async function stripUntranslatedCount(fs: MemoryFs, jsonPath: string): Promise<void> {
  const raw = JSON.parse(await fs.readFile(jsonPath, 'utf-8'))
  delete raw.untranslatedCount
  await fs.writeFile(jsonPath, JSON.stringify(raw), 'utf-8')
}

describe('RunReportsService.list', () => {
  it('says the directory does not exist and returns no items', async () => {
    const service = new RunReportsService(REPORTS_DIR, new OpenableRegistry(), new MemoryFs())
    const result = await service.list()
    expect(result.directoryExists).toBe(false)
    expect(result.items).toEqual([])
    expect(result.unreadable).toEqual([])
    expect(result.truncated).toBe(false)
  })

  it('registers the directory and every report path in the openable registry', async () => {
    const fs = new MemoryFs()
    const { jsonPath, csvPath } = await seedReport(fs)
    const openable = new OpenableRegistry()
    const service = new RunReportsService(REPORTS_DIR, openable, fs)

    await service.list()
    expect(openable.has(REPORTS_DIR)).toBe(true)
    expect(openable.has(jsonPath)).toBe(true)
    expect(openable.has(csvPath)).toBe(true)
  })

  it('lists a valid report as an item', async () => {
    const fs = new MemoryFs()
    const { file } = await seedReport(fs)
    const service = new RunReportsService(REPORTS_DIR, new OpenableRegistry(), fs)

    const result = await service.list()
    expect(result.directoryExists).toBe(true)
    expect(result.items).toHaveLength(1)
    expect(result.items[0]?.file).toBe(file)
    expect(result.unreadable).toEqual([])
  })

  it('caps the list at 200 items and reports truncated when there are more', async () => {
    const fs = new MemoryFs()
    for (let i = 0; i < 205; i++) {
      await seedReport(fs, { startedAt: STARTED + i * 1_000 })
    }
    const service = new RunReportsService(REPORTS_DIR, new OpenableRegistry(), fs)

    const result = await service.list()
    expect(result.items).toHaveLength(200)
    expect(result.truncated).toBe(true)
  })

  it('reads only the 200 newest reports, newest first, and touches nothing beyond them', async () => {
    const fs = new MemoryFs()
    for (let i = 0; i < 205; i++) {
      await seedReport(fs, { startedAt: STARTED + i * 1_000 })
    }
    const read: string[] = []
    const realReadFile = fs.readFile.bind(fs)
    fs.readFile = async (path, encoding) => {
      read.push(path)
      return realReadFile(path, encoding)
    }
    const service = new RunReportsService(REPORTS_DIR, new OpenableRegistry(), fs)

    const result = await service.list()
    expect(read).toHaveLength(200)
    const newest = `run-${stamp(STARTED + 204 * 1_000)}.json`
    const oldestKept = `run-${stamp(STARTED + 5 * 1_000)}.json`
    expect(result.items[0]?.file).toBe(newest)
    expect(result.items[199]?.file).toBe(oldestKept)
  })

  it('lists a report written before the untranslated count existed', async () => {
    const fs = new MemoryFs()
    const { file, jsonPath } = await seedReport(fs)
    await stripUntranslatedCount(fs, jsonPath)
    const service = new RunReportsService(REPORTS_DIR, new OpenableRegistry(), fs)

    const result = await service.list()
    expect(result.unreadable).toEqual([])
    expect(result.items[0]?.file).toBe(file)
  })

  it('puts a corrupt report in unreadable rather than failing the whole list', async () => {
    const fs = new MemoryFs({
      [`${REPORTS_DIR}/run-corrupt.json`]: 'not json at all'
    })
    const service = new RunReportsService(REPORTS_DIR, new OpenableRegistry(), fs)

    const result = await service.list()
    expect(result.items).toEqual([])
    expect(result.unreadable).toEqual(['run-corrupt.json'])
  })
})

describe('RunReportsService.get', () => {
  it('returns the report without the untranslated array, plus its count', async () => {
    const fs = new MemoryFs()
    const { file } = await seedReport(fs, {
      untranslated: [
        {
          modId: 'mymod',
          modName: 'My Mod',
          language: 'ru',
          key: 'K',
          file: 'a_l_english.yml',
          source: 'text',
          state: 'kept'
        }
      ]
    })
    const service = new RunReportsService(REPORTS_DIR, new OpenableRegistry(), fs)

    const detail = await service.get(file)
    expect(detail.untranslatedCount).toBe(1)
    expect('untranslated' in detail.report).toBe(false)
  })

  it('counts the keys of a report written before the count was stored', async () => {
    const fs = new MemoryFs()
    const { file, jsonPath } = await seedReport(fs, {
      untranslated: [
        {
          modId: 'mymod',
          modName: 'My Mod',
          language: 'ru',
          key: 'K',
          file: 'a_l_english.yml',
          source: 'text',
          state: 'kept'
        },
        {
          modId: 'mymod',
          modName: 'My Mod',
          language: 'ru',
          key: 'L',
          file: 'a_l_english.yml',
          source: 'text',
          state: 'kept'
        }
      ]
    })
    await stripUntranslatedCount(fs, jsonPath)
    const service = new RunReportsService(REPORTS_DIR, new OpenableRegistry(), fs)

    const detail = await service.get(file)
    expect(detail.untranslatedCount).toBe(2)
    expect('untranslated' in detail.report).toBe(false)
  })

  it('registers the json and csv paths', async () => {
    const fs = new MemoryFs()
    const { file, jsonPath, csvPath } = await seedReport(fs)
    const openable = new OpenableRegistry()
    const service = new RunReportsService(REPORTS_DIR, openable, fs)

    await service.get(file)
    expect(openable.has(jsonPath)).toBe(true)
    expect(openable.has(csvPath)).toBe(true)
  })

  it('rejects a filename that is not a run report name', async () => {
    const service = new RunReportsService(REPORTS_DIR, new OpenableRegistry(), new MemoryFs())
    await expect(service.get('nope.txt')).rejects.toThrow(TRPCError)
    await expect(service.get('../../evil.json')).rejects.toThrow(TRPCError)
    await expect(service.get('run-x.json/../../y')).rejects.toThrow(TRPCError)
  })

  it('throws NOT_FOUND for a well-formed name that does not exist', async () => {
    const service = new RunReportsService(REPORTS_DIR, new OpenableRegistry(), new MemoryFs())
    await expect(service.get('run-missing.json')).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})

describe('RunReportsService.remove', () => {
  it('rejects a bad filename with BAD_REQUEST', async () => {
    const service = new RunReportsService(REPORTS_DIR, new OpenableRegistry(), new MemoryFs())
    await expect(service.remove('nope.txt')).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    await expect(service.remove('../../evil.json')).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    await expect(service.remove('run-x.json/../../y')).rejects.toMatchObject({
      code: 'BAD_REQUEST'
    })
  })

  it('throws NOT_FOUND when the json does not exist', async () => {
    const service = new RunReportsService(REPORTS_DIR, new OpenableRegistry(), new MemoryFs())
    await expect(service.remove('run-missing.json')).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('removes both the json and the csv when both exist', async () => {
    const fs = new MemoryFs()
    const { file, jsonPath, csvPath } = await seedReport(fs)
    const service = new RunReportsService(REPORTS_DIR, new OpenableRegistry(), fs)

    const result = await service.remove(file)
    expect(result.removed.toSorted()).toEqual([csvPath, jsonPath].toSorted())
    expect(await fs.exists(jsonPath)).toBe(false)
    expect(await fs.exists(csvPath)).toBe(false)
  })

  it('removes only the json when there is no csv sibling', async () => {
    const fs = new MemoryFs()
    const { file, jsonPath, csvPath } = await seedReport(fs)
    await fs.unlink(csvPath)
    const service = new RunReportsService(REPORTS_DIR, new OpenableRegistry(), fs)

    const result = await service.remove(file)
    expect(result.removed).toEqual([jsonPath])
  })

  it('still succeeds when the csv is locked, reporting only the json as removed', async () => {
    const fs = new MemoryFs()
    const { file, jsonPath, csvPath } = await seedReport(fs)
    const realUnlink = fs.unlink.bind(fs)
    fs.unlink = async path => {
      if (path === csvPath) throw new Error('EBUSY')
      return realUnlink(path)
    }
    const service = new RunReportsService(REPORTS_DIR, new OpenableRegistry(), fs)

    const result = await service.remove(file)
    expect(result.removed).toEqual([jsonPath])
    expect(await fs.exists(jsonPath)).toBe(false)
    expect(await fs.exists(csvPath)).toBe(true)
  })

  it('fails when the json itself cannot be removed', async () => {
    const fs = new MemoryFs()
    const { file, jsonPath } = await seedReport(fs)
    fs.unlink = async () => {
      throw new Error('EBUSY')
    }
    const service = new RunReportsService(REPORTS_DIR, new OpenableRegistry(), fs)

    await expect(service.remove(file)).rejects.toThrow(/EBUSY/)
    expect(await fs.exists(jsonPath)).toBe(true)
  })
})
