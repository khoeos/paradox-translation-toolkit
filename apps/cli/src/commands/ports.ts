import type {
  ConversionOutput,
  KeyReport,
  RunReportPort,
  TranslationSetupPort
} from '@ptt/converter'
import { nodeFetch, nodeFs } from '@ptt/fs-node'
import { buildRunReport, writeRunReport } from '@ptt/report'
import type { RunReportInputs } from '@ptt/report'
import { createEngineForRun, describeGlossaryProblems } from '@ptt/translate'
import type { TranslationEngine } from '@ptt/translate'

import { consolePort } from '../console-port.js'
import type { CliOptions } from '../options.js'
import { openMemory } from './shared.js'

export interface CliRunPorts {
  translationSetup: TranslationSetupPort
  runReport: RunReportPort
}

export function createRunPorts(options: CliOptions, signal: AbortSignal): CliRunPorts {
  const port = consolePort()
  let engine: TranslationEngine | undefined

  const translationSetup: TranslationSetupPort = {
    async open({ sourceLanguage, targetLanguages }) {
      const memory = await openMemory(options)
      const flush = (): Promise<void> => memory.flush()
      if (options.translate === undefined) return { memory, flush }

      engine = await createEngineForRun(
        {
          config: options.translate,
          game: options.game,
          sourceLanguage,
          targetLanguages,
          memory,
          userDataPath: options.userDataPath,
          signal,
          onProgress: counters => port.emit({ type: 'translate-progress', jobId: 'cli', counters })
        },
        nodeFs,
        nodeFetch
      )

      return {
        engine,
        memory,
        flush,
        glossaryProblems: describeGlossaryProblems(engine.getGlossaryReport())
      }
    }
  }

  const runReport: RunReportPort = {
    write: facts =>
      writeRunReport(
        options.reportsDir,
        buildRunReport(toReportInputs(options, engine, facts)),
        nodeFs
      )
  }

  return { translationSetup, runReport }
}

function toReportInputs(
  options: CliOptions,
  engine: TranslationEngine | undefined,
  facts: {
    startedAt: number
    finishedAt: number
    output: ConversionOutput
    untranslated: readonly KeyReport[]
  }
): RunReportInputs {
  return {
    startedAt: facts.startedAt,
    finishedAt: facts.finishedAt,
    rootDir: options.rootDir,
    gameId: options.game.id,
    mode: options.mode,
    sourceLanguage: options.sourceLanguage,
    targets: options.targets,
    targetContent: options.targetContent,
    output: facts.output,
    untranslated: facts.untranslated,
    ...(options.selectedMods !== undefined && { selectedMods: options.selectedMods }),
    ...(options.retranslateOwnKeys && { retranslateOwnKeys: true }),

    ...(options.translate !== undefined && { translate: options.translate }),
    ...(engine !== undefined && {
      counters: engine.getCounters(),
      refusals: engine.getRefusals(),
      glossaries: engine.getGlossaryStats()
    })
  }
}
