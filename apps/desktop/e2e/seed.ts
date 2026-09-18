import { nodeFs } from '@ptt/fs-node'
import { buildRunReport, runReportsDir, writeRunReport } from '@ptt/report'
import type { RunReportInputs } from '@ptt/report'

const HOUR_MS = 60 * 60 * 1000

export async function seedRunReport(
  userDataDir: string,
  over: Partial<RunReportInputs> = {}
): Promise<string> {
  const finishedAt = Date.now()
  const inputs: RunReportInputs = {
    startedAt: finishedAt - HOUR_MS,
    finishedAt,
    rootDir: '/seeded/mods',
    gameId: 'stellaris',
    mode: 'create-translation-mod',
    targetContent: 'missing-keys',
    sourceLanguage: 'en',
    targets: [{ language: 'ru', fileToken: 'russian' }],
    untranslated: [],
    output: {
      totals: {
        mods: 3,
        modsWithFiles: 2,
        created: 7,
        skipped: 1,
        unchanged: 0,
        failed: 0,
        pruned: 0,
        errors: 0
      },
      mods: [
        {
          id: 'seeded-mod',
          name: 'Seeded Mod',
          path: '/seeded/mods/seeded-mod',
          localisationFiles: 4,
          sourceFiles: 4,
          createdCount: 7,
          skippedCount: 1,
          unchangedCount: 0,
          failedCount: 0,
          prunedCount: 0,
          created: { ru: ['a_l_russian.yml'] },
          errors: []
        }
      ]
    },
    ...over
  }

  const written = await writeRunReport(runReportsDir(userDataDir), buildRunReport(inputs), nodeFs)
  if (!written) throw new Error(`Could not seed a run report into ${userDataDir}`)
  return written.file
}
