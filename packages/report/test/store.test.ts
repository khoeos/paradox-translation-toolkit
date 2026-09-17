import { describe, expect, it } from 'vitest'

import { MemoryFs } from '@ptt/converter/test/memory-fs'

import {
  buildCsvSiblingPath,
  buildRunReportSummary,
  getRunOutcome,
  isRunReportFileName,
  listRunReportFiles,
  readRunReport,
  readRunReportMeta,
  writeRunReport
} from '../src/index.js'
import type { RunReport } from '../src/index.js'

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
    mods: 2,
    modsWithFiles: 1,
    created: 3,
    skipped: 1,
    unchanged: 0,
    failed: 0,
    pruned: 2,
    errors: 0
  },
  mods: [
    {
      id: 'mymod',
      name: 'My Mod',
      path: 'workshop/mymod',
      localisationFiles: 2,
      sourceFiles: 1,
      createdCount: 3,
      skippedCount: 1,
      unchangedCount: 0,
      failedCount: 0,
      prunedCount: 2,
      created: { ru: ['a_l_russian.yml'] },
      errors: []
    }
  ],
  untranslated: [],
  ...over
})

describe('isRunReportFileName', () => {
  it('accepts a run report filename', () => {
    expect(isRunReportFileName('run-2026-08-08T14-37-33-000Z.json')).toBe(true)
  })

  it('rejects anything else, including a path with separators', () => {
    expect(isRunReportFileName('report.json')).toBe(false)
    expect(isRunReportFileName('run-x.json/../y')).toBe(false)
    expect(isRunReportFileName('../../evil.json')).toBe(false)
    expect(isRunReportFileName('run-x.csv')).toBe(false)
  })
})

describe('buildCsvSiblingPath', () => {
  it('swaps the .json extension for .csv', () => {
    expect(buildCsvSiblingPath('reports/run-1.json')).toBe('reports/run-1.csv')
  })
})

describe('listRunReportFiles', () => {
  it('returns an empty list when the directory does not exist', async () => {
    const fs = new MemoryFs()
    expect(await listRunReportFiles('reports', fs)).toEqual({ files: [], truncated: false })
  })

  it('returns an empty list rather than throwing when the directory cannot be read', async () => {
    const fs = new MemoryFs()
    await writeRunReport('reports', report(), fs)
    fs.readdir = async () => {
      throw new Error('EACCES')
    }
    expect(await listRunReportFiles('reports', fs)).toEqual({ files: [], truncated: false })
  })

  it('lists run reports newest first', async () => {
    const fs = new MemoryFs()
    await writeRunReport('reports', report({ startedAt: STARTED, finishedAt: FINISHED }), fs)
    await writeRunReport(
      'reports',
      report({ startedAt: STARTED + 1000, finishedAt: FINISHED + 1000 }),
      fs
    )
    const { files } = await listRunReportFiles('reports', fs)
    expect(files.map(f => f.file)).toEqual([
      'run-2026-08-08T14-37-34-000Z.json',
      'run-2026-08-08T14-37-33-000Z.json'
    ])
  })

  it('keeps the newest files only, and says it truncated, when a limit is given', async () => {
    const fs = new MemoryFs()
    for (let i = 0; i < 4; i++) {
      await writeRunReport(
        'reports',
        report({ startedAt: STARTED + i * 1000, finishedAt: FINISHED + i * 1000 }),
        fs
      )
    }
    const { files, truncated } = await listRunReportFiles('reports', fs, { limit: 2 })
    expect(files.map(f => f.file)).toEqual([
      'run-2026-08-08T14-37-36-000Z.json',
      'run-2026-08-08T14-37-35-000Z.json'
    ])
    expect(truncated).toBe(true)
  })

  it('does not stat the files it drops beyond the limit', async () => {
    const fs = new MemoryFs()
    for (let i = 0; i < 4; i++) {
      await writeRunReport(
        'reports',
        report({ startedAt: STARTED + i * 1000, finishedAt: FINISHED + i * 1000 }),
        fs
      )
    }
    const asked: string[] = []
    const realExists = fs.exists.bind(fs)
    fs.exists = async path => {
      asked.push(path)
      return realExists(path)
    }
    await listRunReportFiles('reports', fs, { limit: 2 })
    expect(asked).toEqual([
      'reports/run-2026-08-08T14-37-36-000Z.csv',
      'reports/run-2026-08-08T14-37-35-000Z.csv'
    ])
  })

  it('is not truncated when the limit is not reached', async () => {
    const fs = new MemoryFs()
    await writeRunReport('reports', report(), fs)
    expect((await listRunReportFiles('reports', fs, { limit: 5 })).truncated).toBe(false)
  })

  it('ignores files that are not run reports and directories', async () => {
    const fs = new MemoryFs({ 'reports/notes.txt': 'hi', 'reports/report.json': '{}' })
    await fs.mkdir('reports/subdir', { recursive: true })
    await writeRunReport('reports', report(), fs)
    const { files } = await listRunReportFiles('reports', fs)
    expect(files).toHaveLength(1)
    expect(files[0]?.file).toBe('run-2026-08-08T14-37-33-000Z.json')
  })

  it('stays newest-first even when csv existence checks resolve out of order', async () => {
    const fs = new MemoryFs()
    for (let i = 0; i < 5; i++) {
      await writeRunReport(
        'reports',
        report({ startedAt: STARTED + i * 1000, finishedAt: FINISHED + i * 1000 }),
        fs
      )
    }
    const realExists = fs.exists.bind(fs)
    let callIndex = 0
    fs.exists = async path => {
      const hops = 5 - callIndex++
      for (let n = 0; n < hops; n++) await Promise.resolve()
      return realExists(path)
    }
    const { files } = await listRunReportFiles('reports', fs)
    expect(files.map(f => f.file)).toEqual([
      'run-2026-08-08T14-37-37-000Z.json',
      'run-2026-08-08T14-37-36-000Z.json',
      'run-2026-08-08T14-37-35-000Z.json',
      'run-2026-08-08T14-37-34-000Z.json',
      'run-2026-08-08T14-37-33-000Z.json'
    ])
  })

  it('reports whether the CSV sibling exists', async () => {
    const fs = new MemoryFs()
    const written = await writeRunReport('reports', report(), fs)
    const { files } = await listRunReportFiles('reports', fs)
    expect(files[0]?.csvExists).toBe(true)
    expect(files[0]?.csvPath).toBe(written?.csvPath)

    await fs.unlink(written?.csvPath ?? '')
    const filesNoCsv = await listRunReportFiles('reports', fs)
    expect(filesNoCsv.files[0]?.csvExists).toBe(false)
  })
})

const V3_0_0_REPORT = {
  startedAt: '2026-08-08T14:37:33.000Z',
  finishedAt: '2026-08-08T14:38:38.000Z',
  seconds: 65,
  request: {
    path: 'workshop',
    game: 'stellaris',
    mode: 'create-translation-mod',
    targetContent: 'missing-keys',
    sourceLanguage: 'en',
    targetLanguages: ['ru'],
    selectedMods: 'all'
  },
  totals: {
    mods: 2,
    modsWithFiles: 1,
    created: 3,
    skipped: 1,
    unchanged: 0,
    failed: 0,
    pruned: 2,
    errors: 0
  },
  refusalsByReason: {},
  refusalsDropped: 0,
  mods: [
    {
      id: 'mymod',
      name: 'My Mod',
      created: 3,
      skipped: 1,
      unchanged: 0,
      failed: 0,
      pruned: 2,
      errors: []
    }
  ],
  untranslated: [
    {
      modId: 'mymod',
      modName: 'My Mod',
      language: 'ru',
      key: 'K',
      file: 'a_l_english.yml',
      source: 'text',
      state: 'missing'
    }
  ],
  untranslatedCount: 1
}

describe('readRunReport', () => {
  it('reads back a written report', async () => {
    const fs = new MemoryFs()
    const written = await writeRunReport('reports', report(), fs)
    const parsed = await readRunReport(written?.jsonPath ?? '', fs)
    expect(parsed.request.game).toBe('stellaris')
  })

  it('reads back a v3.0.0 report with none of the fields added since, without throwing', async () => {
    const fs = new MemoryFs({ 'reports/run-v3.json': JSON.stringify(V3_0_0_REPORT) })
    const parsed = await readRunReport('reports/run-v3.json', fs)
    expect(parsed.request.game).toBe('stellaris')
    expect(parsed.glossaries).toBeUndefined()
    expect(parsed.identicalCount).toBeUndefined()
    expect(parsed.request.retranslateOwnKeys).toBeUndefined()
  })

  it('throws a descriptive error for invalid JSON', async () => {
    const fs = new MemoryFs({ 'reports/run-bad.json': 'not json' })
    await expect(readRunReport('reports/run-bad.json', fs)).rejects.toThrow(/not valid JSON/)
  })

  it('throws a descriptive error for a report the schema rejects', async () => {
    const fs = new MemoryFs({ 'reports/run-bad.json': JSON.stringify({ startedAt: '2026' }) })
    await expect(readRunReport('reports/run-bad.json', fs)).rejects.toThrow(
      /not a run report this build understands/
    )
  })
})

describe('readRunReportMeta', () => {
  const key = {
    modId: 'mymod',
    modName: 'My Mod',
    language: 'ru',
    key: 'K',
    file: 'a_l_english.yml',
    source: 'text',
    state: 'kept'
  } as const

  it('reads the report without the untranslated array, and takes the count from the scalar', async () => {
    const fs = new MemoryFs()
    const written = await writeRunReport('reports', report({ untranslated: [key, key] }), fs)
    const meta = await readRunReportMeta(written?.jsonPath ?? '', fs)
    expect(meta.untranslatedCount).toBe(2)
    expect('untranslated' in meta).toBe(false)
    expect(meta.request.game).toBe('stellaris')
  })

  it('never validates the untranslated array, so a corrupt entry still opens', async () => {
    const fs = new MemoryFs()
    const written = await writeRunReport('reports', report({ untranslated: [key] }), fs)
    const raw = JSON.parse(await fs.readFile(written?.jsonPath ?? '', 'utf-8'))
    raw.untranslated = [{ nonsense: true }]
    await fs.writeFile(written?.jsonPath ?? '', JSON.stringify(raw), 'utf-8')
    expect((await readRunReportMeta(written?.jsonPath ?? '', fs)).untranslatedCount).toBe(1)
  })

  it('falls back to the array length for a report written before the count existed', async () => {
    const fs = new MemoryFs()
    const written = await writeRunReport('reports', report({ untranslated: [key, key, key] }), fs)
    const raw = JSON.parse(await fs.readFile(written?.jsonPath ?? '', 'utf-8'))
    delete raw.untranslatedCount
    await fs.writeFile(written?.jsonPath ?? '', JSON.stringify(raw), 'utf-8')
    const meta = await readRunReportMeta(written?.jsonPath ?? '', fs)
    expect(meta.untranslatedCount).toBe(3)
  })

  it('counts zero for a legacy report with no untranslated array at all', async () => {
    const fs = new MemoryFs()
    const written = await writeRunReport('reports', report(), fs)
    const raw = JSON.parse(await fs.readFile(written?.jsonPath ?? '', 'utf-8'))
    delete raw.untranslatedCount
    delete raw.untranslated
    await fs.writeFile(written?.jsonPath ?? '', JSON.stringify(raw), 'utf-8')
    expect((await readRunReportMeta(written?.jsonPath ?? '', fs)).untranslatedCount).toBe(0)
  })

  it('rejects invalid JSON and a report the schema refuses, like readRunReport does', async () => {
    const fs = new MemoryFs({
      'reports/run-bad.json': 'not json',
      'reports/run-short.json': JSON.stringify({ startedAt: '2026' })
    })
    await expect(readRunReportMeta('reports/run-bad.json', fs)).rejects.toThrow(/not valid JSON/)
    await expect(readRunReportMeta('reports/run-short.json', fs)).rejects.toThrow(
      /not a run report this build understands/
    )
  })
})

describe('getRunOutcome', () => {
  it('is cancelled when the run was cancelled, regardless of totals', () => {
    expect(getRunOutcome({ failed: 3, errors: 5, cancelled: true })).toBe('cancelled')
  })

  it('is failed when anything failed to write', () => {
    expect(getRunOutcome({ failed: 1, errors: 0 })).toBe('failed')
  })

  it('is issues when nothing failed but errors were logged', () => {
    expect(getRunOutcome({ failed: 0, errors: 2 })).toBe('issues')
  })

  it('is clean otherwise', () => {
    expect(getRunOutcome({ failed: 0, errors: 0 })).toBe('clean')
    expect(getRunOutcome({ failed: 0, errors: 0, cancelled: false })).toBe('clean')
  })
})

describe('buildRunReportSummary', () => {
  it('maps the parsed report to scalar summary fields', async () => {
    const fs = new MemoryFs()
    const written = await writeRunReport('reports', report(), fs)
    const parsed = await readRunReport(written?.jsonPath ?? '', fs)
    const { files } = await listRunReportFiles('reports', fs)
    const file = files[0]
    if (!file) throw new Error('expected a file')
    const summary = buildRunReportSummary(file, parsed)
    expect(summary).toMatchObject({
      file: file.file,
      game: 'stellaris',
      mode: 'create-translation-mod',
      targetContent: 'missing-keys',
      selectedMods: 'all',
      created: 3,
      failed: 0,
      errors: 0,
      mods: 2,
      modsWithFiles: 1,
      modsWithErrors: 0,
      cancelled: false,
      outcome: 'clean'
    })
    expect(summary.translationModName).toBeUndefined()
  })

  it('counts mods with at least one error', async () => {
    const fs = new MemoryFs()
    const withErrors = report({
      mods: [
        {
          id: 'a',
          name: 'A',
          path: 'workshop/a',
          localisationFiles: 1,
          sourceFiles: 1,
          createdCount: 0,
          skippedCount: 0,
          unchangedCount: 0,
          failedCount: 1,
          prunedCount: 0,
          created: {},
          errors: ['boom']
        },
        {
          id: 'b',
          name: 'B',
          path: 'workshop/b',
          localisationFiles: 1,
          sourceFiles: 1,
          createdCount: 1,
          skippedCount: 0,
          unchangedCount: 0,
          failedCount: 0,
          prunedCount: 0,
          created: {},
          errors: []
        }
      ]
    })
    const written = await writeRunReport('reports', withErrors, fs)
    const parsed = await readRunReport(written?.jsonPath ?? '', fs)
    const { files } = await listRunReportFiles('reports', fs)
    const file = files[0]
    if (!file) throw new Error('expected a file')
    expect(buildRunReportSummary(file, parsed).modsWithErrors).toBe(1)
  })

  it('carries a count of selected mods and the translation mod name when present', async () => {
    const fs = new MemoryFs()
    const withSelection = report({
      request: { ...report().request, selectedMods: ['a', 'b'] },
      translationMod: {
        name: 'My Pack',
        folder: 'my_pack',
        path: 'mods/my_pack',
        supportedVersion: '*'
      }
    })
    const written = await writeRunReport('reports', withSelection, fs)
    const parsed = await readRunReport(written?.jsonPath ?? '', fs)
    const { files } = await listRunReportFiles('reports', fs)
    const file = files[0]
    if (!file) throw new Error('expected a file')
    const summary = buildRunReportSummary(file, parsed)
    expect(summary.selectedMods).toBe(2)
    expect(summary.translationModName).toBe('My Pack')
  })

  it('marks the outcome cancelled and carries the flag when the run was cancelled', async () => {
    const fs = new MemoryFs()
    const written = await writeRunReport('reports', report({ cancelled: true }), fs)
    const parsed = await readRunReport(written?.jsonPath ?? '', fs)
    const { files } = await listRunReportFiles('reports', fs)
    const file = files[0]
    if (!file) throw new Error('expected a file')
    const summary = buildRunReportSummary(file, parsed)
    expect(summary.cancelled).toBe(true)
    expect(summary.outcome).toBe('cancelled')
  })

  it('carries the glossary counters when the report has glossary stats, and omits them otherwise', async () => {
    const fs = new MemoryFs()
    const withGlossaries = report({
      glossaries: [
        {
          language: 'ru',
          builtFrom: 'a.csv',
          root: 'glossaries',
          files: 2,
          exact: 3,
          terms: 12,
          truncated: false
        },
        {
          language: 'tr',
          builtFrom: 'b.csv',
          root: 'glossaries',
          files: 1,
          exact: 1,
          terms: 5,
          truncated: true
        }
      ]
    })
    const written = await writeRunReport('reports', withGlossaries, fs)
    const parsed = await readRunReport(written?.jsonPath ?? '', fs)
    const { files } = await listRunReportFiles('reports', fs)
    const file = files[0]
    if (!file) throw new Error('expected a file')
    const summary = buildRunReportSummary(file, parsed)
    expect(summary.glossaryFiles).toBe(3)
    expect(summary.glossaryExact).toBe(4)

    const withoutGlossaries = await writeRunReport('reports', report(), fs)
    const parsedWithout = await readRunReport(withoutGlossaries?.jsonPath ?? '', fs)
    const withoutFile = (await listRunReportFiles('reports', fs)).files.find(
      f => f.jsonPath === withoutGlossaries?.jsonPath
    )
    if (!withoutFile) throw new Error('expected a file')
    const summaryWithout = buildRunReportSummary(withoutFile, parsedWithout)
    expect(summaryWithout.glossaryFiles).toBeUndefined()
    expect(summaryWithout.glossaryExact).toBeUndefined()
  })
})
