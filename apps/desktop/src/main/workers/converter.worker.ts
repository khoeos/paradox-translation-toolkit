import { posixJoin, runConvert, scanMods } from '@ptt/converter'
import type { Cancellation, JobEvent, ProgressPort, TranslationMod } from '@ptt/converter'
import { nodeFetch, nodeFs } from '@ptt/fs-node'
import { buildRunReport, writeRunReport } from '@ptt/report'
import type {
  ConvertMode,
  GameDefinition,
  LanguageCode,
  TargetContent
} from '@ptt/shared'
import type { TranslateConfig } from '@ptt/translate'
import { createEngineForRun, openTranslationMemory } from '@ptt/translate'

interface ScanModsCommand {
  type: 'scan-mods'
  jobId: string
  rootDir: string
  game: GameDefinition
  sourceLanguage: LanguageCode
  targetLanguages: LanguageCode[]
  generatedMod?: TranslationMod
  userDataPath?: string
  translate?: TranslateConfig
  detail?: boolean
}

interface ConvertCommand {
  type: 'convert'
  jobId: string
  rootDir: string
  game: GameDefinition
  sourceLanguage: LanguageCode
  targetLanguages: LanguageCode[]
  mode: ConvertMode
  outputDir?: string
  selectedMods?: string[]
  targetContent?: TargetContent
  generatedMod?: TranslationMod
  generatedModsDir?: string
  userDataPath?: string
  translate?: TranslateConfig
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
        cmd.targetLanguages,
        nodeFs
      )
    : undefined

  const output = await scanMods(
    {
      rootDir: cmd.rootDir,
      gameDef: cmd.game,
      sourceLanguage: cmd.sourceLanguage,
      targetLanguages: cmd.targetLanguages,
      countLines: cmd.translate?.enabled === true,
      detail: cmd.detail ?? false,
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
      ...(memory !== undefined && { memory })
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
  const startedAt = Date.now()
  const translate = cmd.translate?.enabled === true ? cmd.translate : undefined

  const memory = cmd.userDataPath
    ? await openTranslationMemory(
        cmd.userDataPath,
        cmd.game.id,
        cmd.translate,
        cmd.targetLanguages,
        nodeFs
      )
    : undefined

  const engine =
    translate && memory
      ? await createEngineForRun(
          {
            config: translate,
            game: cmd.game,
            sourceLanguage: cmd.sourceLanguage,
            targetLanguages: cmd.targetLanguages,
            memory,
            signal: abort.signal,
            onProgress: counters =>
              emit({ type: 'translate-progress', jobId: cmd.jobId, counters }),
            ...(cmd.userDataPath !== undefined && { userDataPath: cmd.userDataPath })
          },
          nodeFs,
          nodeFetch
        )
      : undefined

  const { output, untranslated } = await runConvert(
    {
      jobId: cmd.jobId,
      rootDir: cmd.rootDir,
      game: cmd.game,
      sourceLanguage: cmd.sourceLanguage,
      targetLanguages: cmd.targetLanguages,
      mode: cmd.mode,
      cancellation,
      ...(cmd.outputDir !== undefined && { outputDir: cmd.outputDir }),
      ...(cmd.selectedMods !== undefined && { selectedMods: cmd.selectedMods }),
      ...(cmd.targetContent !== undefined && { targetContent: cmd.targetContent }),
      ...(cmd.generatedMod !== undefined && { generatedMod: cmd.generatedMod }),
      ...(cmd.generatedModsDir !== undefined && { generatedModsDir: cmd.generatedModsDir }),
      ...(engine !== undefined && { engine }),
      ...(memory !== undefined && { memory })
    },
    nodeFs,
    progress
  )

  await memory?.flush()

  if (cmd.userDataPath !== undefined) {
    const written = await writeRunReport(
      posixJoin(cmd.userDataPath, 'reports'),
      buildRunReport({
        startedAt,
        finishedAt: Date.now(),
        rootDir: cmd.rootDir,
        gameId: cmd.game.id,
        mode: cmd.mode,
        sourceLanguage: cmd.sourceLanguage,
        targetLanguages: cmd.targetLanguages,
        output,
        untranslated,
        targetContent: cmd.targetContent ?? 'missing-keys',
        ...(cmd.selectedMods !== undefined && { selectedMods: cmd.selectedMods }),
        ...(translate !== undefined && { translate }),
        ...(engine !== undefined && {
          counters: engine.getCounters(),
          refusals: engine.getRefusals()
        })
      }),
      nodeFs
    )
    if (written) output.reportPath = written.jsonPath
  }

  if (output.cancelled === true) {
    emit({ type: 'cancelled', jobId: cmd.jobId })
    return
  }
  emit({ type: 'convert-done', jobId: cmd.jobId, output })
}
