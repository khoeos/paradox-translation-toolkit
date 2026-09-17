import type {
  ConversionOutput,
  GameContextRef,
  JobEvent,
  KeyReport,
  RunReportPort,
  TranslationSetupPort
} from '@ptt/converter'
import { nodeFetch, nodeFs } from '@ptt/fs-node'
import { buildRunReport, runReportsDir, writeRunReport } from '@ptt/report'
import type { RunReportInputs } from '@ptt/report'
import type { ConvertMode, LanguageCode, TargetContent, TranslationTarget } from '@ptt/shared'
import { createEngineForRun, describeGlossaryProblems, openTranslationMemory } from '@ptt/translate'
import type { TranslateConfig, TranslationEngine } from '@ptt/translate'

export interface TranslationSetupInputs {
  jobId: string
  game: GameContextRef & { id: string; domain: string }
  userDataPath?: string | undefined
  translate?: TranslateConfig | undefined
  signal: AbortSignal
  emit: (event: JobEvent) => void
}

export interface WorkerTranslationSetup {
  port: TranslationSetupPort
  engine: () => TranslationEngine | undefined
}

export function createTranslationSetup(inputs: TranslationSetupInputs): WorkerTranslationSetup {
  let engine: TranslationEngine | undefined

  const port: TranslationSetupPort = {
    async open({ sourceLanguage, targetLanguages }) {
      if (inputs.userDataPath === undefined) return {}

      const memory = await openTranslationMemory(
        inputs.userDataPath,
        inputs.game.id,
        inputs.translate,
        targetLanguages,
        nodeFs
      )
      const flush = (): Promise<void> => memory.flush()

      if (inputs.translate?.enabled !== true) return { memory, flush }

      engine = await createEngineForRun(
        {
          config: inputs.translate,
          game: inputs.game,
          sourceLanguage,
          targetLanguages,
          memory,
          signal: inputs.signal,
          onProgress: counters =>
            inputs.emit({ type: 'translate-progress', jobId: inputs.jobId, counters }),
          userDataPath: inputs.userDataPath
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

  return { port, engine: () => engine }
}

export interface RunReportPortInputs {
  rootDir: string
  gameId: string
  mode: ConvertMode
  sourceLanguage: LanguageCode
  targets: readonly TranslationTarget[]
  targetContent: TargetContent
  selectedMods?: readonly string[] | undefined
  retranslateOwnKeys?: boolean | undefined
  translate?: TranslateConfig | undefined
  userDataPath?: string | undefined
  engine: () => TranslationEngine | undefined
}

export function createRunReportPort(inputs: RunReportPortInputs): RunReportPort | undefined {
  const { userDataPath } = inputs
  if (userDataPath === undefined) return undefined

  return {
    write: facts =>
      writeRunReport(runReportsDir(userDataPath), buildRunReport(toReportInputs(inputs, facts)), nodeFs)
  }
}

function toReportInputs(
  inputs: RunReportPortInputs,
  facts: {
    startedAt: number
    finishedAt: number
    output: ConversionOutput
    untranslated: readonly KeyReport[]
  }
): RunReportInputs {
  const engine = inputs.engine()
  const translate = inputs.translate?.enabled === true ? inputs.translate : undefined
  return {
    startedAt: facts.startedAt,
    finishedAt: facts.finishedAt,
    rootDir: inputs.rootDir,
    gameId: inputs.gameId,
    mode: inputs.mode,
    sourceLanguage: inputs.sourceLanguage,
    targets: inputs.targets,
    targetContent: inputs.targetContent,
    output: facts.output,
    untranslated: facts.untranslated,
    ...(inputs.selectedMods !== undefined && { selectedMods: inputs.selectedMods }),
    ...(inputs.retranslateOwnKeys && { retranslateOwnKeys: true }),

    ...(translate !== undefined && { translate }),
    ...(engine !== undefined && {
      counters: engine.getCounters(),
      refusals: engine.getRefusals(),
      glossaries: engine.getGlossaryStats()
    })
  }
}
