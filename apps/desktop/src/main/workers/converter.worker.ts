import { apply, diff, plan, scan } from '@ptt/converter-core'
import type { GameDefinition, LanguageCode } from '@ptt/shared-types'

import { nodeFs } from '../services/node-fs.js'

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
  mode: 'add-to-current' | 'extract-to-folder'
  outputDir?: string
  overwrite?: boolean
}

type Command = ScanCommand | RunCommand

const port = process.parentPort
if (!port) {
  throw new Error('No parent port, worker must be spawned via UtilityProcess')
}

function emit(payload: unknown): void {
  port!.postMessage(payload)
}

port.on('message', event => {
  const command = event.data as Command
  void handleCommand(command).catch(err => {
    emit({
      type: 'error',
      jobId: command.jobId,
      message: err instanceof Error ? err.message : String(err)
    })
  })
})

async function handleCommand(cmd: Command): Promise<void> {
  if (cmd.type === 'scan') {
    const result = await scan(cmd.rootDir, cmd.game, nodeFs)
    emit({ type: 'scan-done', jobId: cmd.jobId, result })
    return
  }

  if (cmd.type === 'run') {
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
      onProgress: progress => emit({ ...progress, jobId: cmd.jobId })
    })

    emit({ type: 'done', jobId: cmd.jobId, report })
  }
}
