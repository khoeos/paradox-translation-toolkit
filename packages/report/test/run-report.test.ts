import { describe, expect, it } from 'vitest'

import type { ConversionTotals, KeyReport, ModResult } from '@ptt/converter'
import { MemoryFs } from '@ptt/converter/test/memory-fs'
import type { Refusal } from '@ptt/translate'

import {
  StoredRunReportSchema,
  buildRunReport,
  countByReason,
  stamp,
  toStored,
  writeRunReport
} from '../src/index.js'
import type { RunReport } from '../src/index.js'

const STARTED = Date.UTC(2026, 7, 8, 14, 37, 33)
const FINISHED = STARTED + 65_000

const totals: ConversionTotals = {
  mods: 2,
  modsWithFiles: 1,
  created: 3,
  skipped: 1,
  unchanged: 0,
  failed: 0,
  pruned: 2,
  errors: 0
}

const modResult = (over: Partial<ModResult> = {}): ModResult => ({
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
  errors: [],
  ...over
})

const report = (over: Partial<RunReport> = {}): RunReport => ({
  startedAt: STARTED,
  finishedAt: FINISHED,
  request: {
    path: 'workshop',
    game: 'stellaris',
    mode: 'create-translation-mod',
    targetContent: 'missing-keys',
    sourceLanguage: 'en',
    targetLanguages: ['ru'],
    translate: { provider: 'ollama', model: 'qwen2.5:7b', batchSize: 20, concurrency: 2 }
  },
  totals,
  mods: [modResult()],
  untranslated: [],
  ...over
})

describe('stamp', () => {
  it('sorts by date and holds no character Windows refuses', () => {
    const name = stamp(STARTED)
    expect(name).toBe('2026-08-08T14-37-33-000Z')
    expect(/[:*?"<>|]/.test(name)).toBe(false)
  })
})

describe('countByReason', () => {
  it('tallies the refusals by reason', () => {
    const refusals: Refusal[] = [
      { value: 'a', language: 'ru', reason: 'markup' },
      { value: 'b', language: 'ru', reason: 'markup' },
      { value: 'c', language: 'ru', reason: 'backend' }
    ]
    expect(countByReason(refusals)).toEqual({ markup: 2, backend: 1 })
  })

  it('is empty for a run that refused nothing', () => {
    expect(countByReason([])).toEqual({})
  })
})

describe('buildRunReport', () => {
  it('carries targetContent from the inputs into the request field by field', () => {
    const built = buildRunReport({
      startedAt: STARTED,
      finishedAt: FINISHED,
      rootDir: 'workshop',
      gameId: 'stellaris',
      mode: 'create-translation-mod',
      targetContent: 'complete-file',
      sourceLanguage: 'en',
      targetLanguages: ['ru'],
      output: { totals, mods: [modResult()] },
      untranslated: []
    })
    expect(built.request.targetContent).toBe('complete-file')
  })
})

describe('toStored', () => {
  it('renders the timestamps as ISO strings and the duration in seconds', () => {
    const stored = toStored(report())
    expect(stored.startedAt).toBe('2026-08-08T14:37:33.000Z')
    expect(stored.seconds).toBe(65)
  })

  it('records how many mods were selected, or all', () => {
    expect(toStored(report()).request.selectedMods).toBe('all')
    const withSelection = report({
      request: { ...report().request, selectedMods: ['a', 'b'] }
    })
    expect(toStored(withSelection).request.selectedMods).toBe(2)
  })

  it('never carries an API key, because the type has no field for one', () => {
    const stored = toStored(report())
    expect(JSON.stringify(stored)).not.toContain('apiKey')
    expect('apiKey' in stored.request).toBe(false)
    expect(Object.keys(stored.request.translate ?? {})).toEqual([
      'provider',
      'model',
      'batchSize',
      'concurrency'
    ])
  })

  it('carries targetContent from the request through, so a stored report says what it wrote', () => {
    const withContent = report({
      request: { ...report().request, targetContent: 'regenerate-file' }
    })
    expect(toStored(withContent).request.targetContent).toBe('regenerate-file')
  })

  it('flattens each mod to its counters', () => {
    const stored = toStored(report())
    expect(stored.mods[0]).toMatchObject({
      id: 'mymod',
      created: 3,
      skipped: 1,
      unchanged: 0,
      pruned: 2
    })
  })

  it('omits the translation counters of a mod that was only copied', () => {
    expect('translation' in (toStored(report()).mods[0] ?? {})).toBe(false)
  })

  it('tallies the refusals rather than listing them twice', () => {
    const stored = toStored(
      report({
        refusals: {
          list: [
            { value: 'a', language: 'ru', reason: 'markup' },
            { value: 'b', language: 'ru', reason: 'empty' }
          ],
          dropped: 7
        }
      })
    )
    expect(stored.refusalsByReason).toEqual({ markup: 1, empty: 1 })
    expect(stored.refusalsDropped).toBe(7)
  })
})

describe('writeRunReport', () => {
  const key: KeyReport = {
    modId: 'mymod',
    modName: 'My Mod',
    language: 'ru',
    key: 'K',
    file: 'a_l_english.yml',
    source: 'Colony Ship',
    state: 'english',
    reason: 'markup: lost $A$'
  }

  it('writes a JSON and a CSV side by side', async () => {
    const fs = new MemoryFs()
    const written = await writeRunReport('reports', report({ untranslated: [key] }), fs)
    expect(written?.jsonPath).toBe('reports/run-2026-08-08T14-37-33-000Z.json')
    expect(written?.csvPath).toBe('reports/run-2026-08-08T14-37-33-000Z.csv')
    expect(fs.snapshot().has(written?.jsonPath ?? '')).toBe(true)
    expect(fs.snapshot().has(written?.csvPath ?? '')).toBe(true)
  })

  it('writes a JSON that validates against the schema it declares', async () => {
    const fs = new MemoryFs()
    const written = await writeRunReport('reports', report({ untranslated: [key] }), fs)
    const raw = fs.snapshot().get(written?.jsonPath ?? '') ?? ''
    const parsed = StoredRunReportSchema.safeParse(JSON.parse(raw))
    expect(parsed.success).toBe(true)
  })

  it('lists the untranslated keys in the CSV', async () => {
    const fs = new MemoryFs()
    const written = await writeRunReport('reports', report({ untranslated: [key] }), fs)
    const csv = fs.snapshot().get(written?.csvPath ?? '') ?? ''
    expect(csv).toContain('Colony Ship')
    expect(csv).toContain('markup: lost $A$')
  })

  it('reports how many CSV rows it wrote', async () => {
    const fs = new MemoryFs()
    const written = await writeRunReport('reports', report({ untranslated: [key, key] }), fs)
    expect(written?.csvRows).toBe(2)
  })

  it('creates the reports folder', async () => {
    const fs = new MemoryFs()
    await writeRunReport('deep/reports', report(), fs)
    expect([...fs.snapshot().keys()].some(p => p.startsWith('deep/reports/'))).toBe(true)
  })

  it('never loses a run because its report could not be written', async () => {
    const fs = new MemoryFs()
    fs.writeFile = async () => {
      throw new Error('EROFS')
    }
    expect(await writeRunReport('reports', report(), fs)).toBeUndefined()
  })
})

describe('StoredRunReportSchema', () => {
  it('refuses a truncated report rather than handing back a half object', async () => {
    expect(StoredRunReportSchema.safeParse({ startedAt: '2026-01-01' }).success).toBe(false)
  })

  it('refuses a report naming an unknown language', async () => {
    const fs = new MemoryFs()
    const written = await writeRunReport('reports', report(), fs)
    const raw = JSON.parse(fs.snapshot().get(written?.jsonPath ?? '') ?? '')
    raw.request.sourceLanguage = 'klingon'
    expect(StoredRunReportSchema.safeParse(raw).success).toBe(false)
  })

  it('refuses a report naming an unknown convert mode', async () => {
    const fs = new MemoryFs()
    const written = await writeRunReport('reports', report(), fs)
    const raw = JSON.parse(fs.snapshot().get(written?.jsonPath ?? '') ?? '')
    raw.request.mode = 'delete-everything'
    expect(StoredRunReportSchema.safeParse(raw).success).toBe(false)
  })

  it('accepts a report written before targetContent existed (v3.0.0-beta.1)', async () => {
    const fs = new MemoryFs()
    const written = await writeRunReport('reports', report(), fs)
    const raw = JSON.parse(fs.snapshot().get(written?.jsonPath ?? '') ?? '')
    delete raw.request.targetContent
    expect(StoredRunReportSchema.safeParse(raw).success).toBe(true)
  })

  it('reads back a state the enum is a hand-written copy of', async () => {
    const fs = new MemoryFs()
    const written = await writeRunReport(
      'reports',
      report({
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
      }),
      fs
    )
    const raw = JSON.parse(fs.snapshot().get(written?.jsonPath ?? '') ?? '')
    expect(StoredRunReportSchema.safeParse(raw).success).toBe(true)
  })
})
