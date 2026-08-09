import { apply, diff, plan, posixJoin, runConvert, scan, scanMods } from '@ptt/converter'
import type { Cancellation, JobEvent, ProgressPort, TranslationMod } from '@ptt/converter'
import { nodeFetch, nodeFs } from '@ptt/fs-node'
import { buildRunReport, writeRunReport } from '@ptt/report'
import type { ConvertMode, GameDefinition, LanguageCode } from '@ptt/shared'
import type { TranslateConfig } from '@ptt/translate'
import { createEngineForRun, openTranslationMemory } from '@ptt/translate'

interface ScanCommand {
  type: 'scan'
  jobId: string
  rootDir: string
  game: GameDefinition
}

interface RunCommand {
  type: 'run'
  jobId: string
  rootDir: string
  game: GameDefinition
  sourceLanguage: LanguageCode
  targetLanguages: LanguageCode[]
  mode: ConvertMode
  outputDir?: string
  overwrite?: boolean
}

/** Report what a whole collection is missing, key by key, writing nothing. */
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

/** Write the missing files, translating their values when a backend is configured. */
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
  generatedMod?: TranslationMod
  generatedModsDir?: string
  userDataPath?: string
  translate?: TranslateConfig
}

/** Ask the run to stop after the current unit of work. */
interface CancelCommand {
  type: 'cancel'
  jobId: string
}

type Command = ScanCommand | RunCommand | ScanModsCommand | ConvertCommand | CancelCommand

const parentPort = process.parentPort
if (!parentPort) {
  throw new Error('No parent port, worker must be spawned via UtilityProcess')
}
const port = parentPort

function emit(payload: JobEvent): void {
  port.postMessage(payload)
}

const progress: ProgressPort = { emit }

/**
 * Cooperative cancellation, checked between units of work.
 *
 * Never a kill: the run holds a translation memory buffer of up to 200 entries and can have a
 * request in flight, so being killed mid-flush used to leave a truncated JSON that lost a whole
 * language (audit finding S-8). The flag stops the loops and the AbortController cuts the network
 * call, so the run ends without a half-written file.
 */
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
    case 'scan':
      return handleScan(cmd)
    case 'run':
      return handleRun(cmd)
    case 'scan-mods':
      return handleScanMods(cmd)
    case 'convert':
      return handleConvert(cmd)
  }
}

async function handleScan(cmd: ScanCommand): Promise<void> {
  const result = await scan(cmd.rootDir, cmd.game, nodeFs)
  emit({ type: 'scan-done', jobId: cmd.jobId, result })
}

async function handleRun(cmd: RunCommand): Promise<void> {
  emit({ type: 'scan-progress', jobId: cmd.jobId, processed: 0, total: 0 })
  const overwrite = cmd.overwrite ?? false
  const scanResult = await scan(cmd.rootDir, cmd.game, nodeFs)
  const sourceCount = scanResult.files.filter(f => f.language === cmd.sourceLanguage).length
  const diffPlan = diff(scanResult, cmd.sourceLanguage, cmd.targetLanguages, { overwrite })
  const missingCount = Object.values(diffPlan.missingFiles).reduce(
    (acc, files) => acc + (files?.length ?? 0),
    0
  )
  emit({
    type: 'plan-ready',
    jobId: cmd.jobId,
    scannedCount: scanResult.files.length,
    sourceCount,
    missingCount
  })
  const copyPlan = plan(diffPlan, {
    mode: cmd.mode,
    ...(cmd.outputDir !== undefined && { outputDir: cmd.outputDir }),
    gameDef: cmd.game
  })

  const report = await apply(copyPlan, nodeFs, {
    overwrite,
    onProgress: p => emit({ ...p, jobId: cmd.jobId })
  })

  emit({ type: 'done', jobId: cmd.jobId, report })
}

async function handleScanMods(cmd: ScanModsCommand): Promise<void> {
  // The memory is loaded even for a read-only scan: it is the only thing that can tell a string
  // the backend refused from one it answered with the source text itself.
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
      onProgress: (processed, total, modName) =>
        emit({ type: 'mod-progress', jobId: cmd.jobId, processed, total, modName }),
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
      ...(cmd.generatedMod !== undefined && { generatedMod: cmd.generatedMod }),
      ...(cmd.generatedModsDir !== undefined && { generatedModsDir: cmd.generatedModsDir }),
      ...(engine !== undefined && { engine }),
      ...(memory !== undefined && { memory })
    },
    nodeFs,
    progress
  )

  // Always flushed, cancelled or not: what a stopped run did translate must survive.
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

