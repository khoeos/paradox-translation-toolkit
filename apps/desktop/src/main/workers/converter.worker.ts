import { runConvert, scanMods } from '@ptt/converter'
import type { Cancellation, JobEvent, ProgressPort, TranslationMod } from '@ptt/converter'
import { nodeFs } from '@ptt/fs-node'
import { uniqueTargetLanguages } from '@ptt/shared'

import type {
  ConvertMode,
  GameDefinition,
  LanguageCode,
  TargetContent,
  TranslationTarget
} from '@ptt/shared'
import type { TranslateConfig } from '@ptt/translate'
import { openTranslationMemory } from '@ptt/translate'

import { createRunReportPort, createTranslationSetup } from './ports.js'

interface ScanModsCommand {

  type: 'scan-mods'
  jobId: string
  rootDir: string
  game: GameDefinition
  sourceLanguage: LanguageCode
  targets: TranslationTarget[]
  mode: ConvertMode
  targetContent?: TargetContent
  generatedMod?: TranslationMod
  userDataPath?: string
  translate?: TranslateConfig
  detail?: boolean
  retranslateOwnKeys?: boolean
}


interface ConvertCommand {
  type: 'convert'
  jobId: string
  rootDir: string
  game: GameDefinition
  sourceLanguage: LanguageCode
  targets: TranslationTarget[]
  mode: ConvertMode
  outputDir?: string
  selectedMods?: string[]
  targetContent?: TargetContent
  generatedMod?: TranslationMod
  generatedModsDir?: string
  userDataPath?: string
  translate?: TranslateConfig
  retranslateOwnKeys?: boolean
}

interface CancelCommand {
  type: 'cancel'
  jobId: string
}

type Command = ScanModsCommand | ConvertCommand | CancelCommand

const parentPort = process.parentPort
if (!parentPort) {
  throw new Error('No parent port, worker must be spawned via UtilityProcess')
}
const port = parentPort

function emit(payload: JobEvent): void {
  port.postMessage(payload)
}

const progress: ProgressPort = { emit }

const abort = new AbortController()
const cancellation: Cancellation = { requested: false }

port.on('message', event => {
  const command: unknown = event.data
  if (!isCommand(command)) return

  if (command.type === 'cancel') {
    cancellation.requested = true
    abort.abort()
    return
  }

  void handleCommand(command).catch((err: unknown) => {
    emit({
      type: 'error',
      jobId: command.jobId,
      message: err instanceof Error ? err.message : String(err)
    })
  })
})

function isCommand(value: unknown): value is Command {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    'jobId' in value &&
    typeof value.type === 'string' &&
    typeof value.jobId === 'string'
  )
}

async function handleCommand(cmd: Exclude<Command, CancelCommand>): Promise<void> {
  switch (cmd.type) {
    case 'scan-mods':
      return handleScanMods(cmd)
    case 'convert':
      return handleConvert(cmd)
  }
}

async function handleScanMods(cmd: ScanModsCommand): Promise<void> {
  const memory = cmd.userDataPath
    ? await openTranslationMemory(
        cmd.userDataPath,
        cmd.game.id,
        cmd.translate,
        uniqueTargetLanguages(cmd.targets),
        nodeFs
      )
    : undefined

  const output = await scanMods(
    {
      rootDir: cmd.rootDir,
      gameDef: cmd.game,
      sourceLanguage: cmd.sourceLanguage,
      targets: cmd.targets,
      mode: cmd.mode,
      countLines: cmd.translate?.enabled === true,
      detail: cmd.detail ?? false,
      ...(cmd.targetContent !== undefined && { targetContent: cmd.targetContent }),

      isCancelled: () => cancellation.requested,
      onProgress: (processed, total, modName, totals) =>
        emit({ type: 'mod-progress', jobId: cmd.jobId, processed, total, modName, totals }),
      onPhase: (phase, done, total) =>
        emit({
          type: 'scan-phase',
          jobId: cmd.jobId,
          phase,
          ...(done !== undefined && { done }),
          ...(total !== undefined && { total })
        }),
      onDiagnostic: (message, severity) =>
        emit({ type: 'log', jobId: cmd.jobId, message, severity }),
      ...(cmd.generatedMod !== undefined && {
        generatedModPath: cmd.generatedMod.path,
        generatedModFolder: cmd.generatedMod.folder
      }),
      ...(memory !== undefined && { memory }),
      ...(cmd.retranslateOwnKeys !== undefined && { retranslateOwnKeys: cmd.retranslateOwnKeys })
    },
    nodeFs
  )

  if (cancellation.requested) {
    emit({ type: 'cancelled', jobId: cmd.jobId })
    return
  }
  emit({ type: 'mods-scanned', jobId: cmd.jobId, output })
}

async function handleConvert(cmd: ConvertCommand): Promise<void> {
  const setup = createTranslationSetup({
    jobId: cmd.jobId,
    game: cmd.game,
    signal: abort.signal,
    emit,
    ...(cmd.userDataPath !== undefined && { userDataPath: cmd.userDataPath }),
    ...(cmd.translate !== undefined && { translate: cmd.translate })
  })

  const runReport = createRunReportPort({
    rootDir: cmd.rootDir,
    gameId: cmd.game.id,
    mode: cmd.mode,
    sourceLanguage: cmd.sourceLanguage,
    targets: cmd.targets,
    targetContent: cmd.targetContent ?? 'missing-keys',
    engine: setup.engine,
    ...(cmd.selectedMods !== undefined && { selectedMods: cmd.selectedMods }),
    ...(cmd.retranslateOwnKeys !== undefined && { retranslateOwnKeys: cmd.retranslateOwnKeys }),
    ...(cmd.translate !== undefined && { translate: cmd.translate }),
    ...(cmd.userDataPath !== undefined && { userDataPath: cmd.userDataPath })
  })

  const { output } = await runConvert(
    {
      jobId: cmd.jobId,
      rootDir: cmd.rootDir,
      game: cmd.game,
      sourceLanguage: cmd.sourceLanguage,
      targets: cmd.targets,
      mode: cmd.mode,
      cancellation,
      translationSetup: setup.port,
      ...(runReport !== undefined && { runReport }),
      ...(cmd.outputDir !== undefined && { outputDir: cmd.outputDir }),
      ...(cmd.selectedMods !== undefined && { selectedMods: cmd.selectedMods }),
      ...(cmd.targetContent !== undefined && { targetContent: cmd.targetContent }),
      ...(cmd.generatedMod !== undefined && { generatedMod: cmd.generatedMod }),
      ...(cmd.generatedModsDir !== undefined && { generatedModsDir: cmd.generatedModsDir }),
      ...(cmd.retranslateOwnKeys !== undefined && { retranslateOwnKeys: cmd.retranslateOwnKeys })
    },
    nodeFs,
    progress
  )

  if (output.cancelled === true) {
    emit({ type: 'cancelled', jobId: cmd.jobId })
    return
  }
  emit({ type: 'convert-done', jobId: cmd.jobId, output })
}
