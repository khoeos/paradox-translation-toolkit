import { TRPCError } from '@trpc/server'

import { mapWithConcurrency, posixJoin } from '@ptt/converter'
import {
  buildCsvSiblingPath,
  buildRunReportSummary,
  isRunReportFileName,
  listRunReportFiles,
  readRunReportMeta,
  type ParsedRunReport,
  type RunReportSummary
} from '@ptt/report'
import type { FsLike } from '@ptt/shared'

import { nodeFs } from './node-fs.js'
import type { OpenableRegistry } from './openable-registry.js'

const LIST_SCAN_LIMIT = 200
const READ_CONCURRENCY = 16

export interface RunReportListResult {
  directory: string
  directoryExists: boolean
  items: RunReportSummary[]
  unreadable: string[]
  truncated: boolean
}

export interface RunReportDetail {
  file: string
  jsonPath: string
  csvPath: string
  csvExists: boolean
  report: Omit<ParsedRunReport, 'untranslated'>
  untranslatedCount: number
}

export class RunReportsService {
  constructor(
    private readonly reportsDir: string,
    private readonly openable: OpenableRegistry,
    private readonly fs: FsLike = nodeFs
  ) {}

  async list(): Promise<RunReportListResult> {
    this.openable.add(this.reportsDir)
    const directoryExists = await this.fs.exists(this.reportsDir)
    const { files, truncated } = await listRunReportFiles(this.reportsDir, this.fs, {
      limit: LIST_SCAN_LIMIT
    })

    const unreadable: string[] = []
    const results = await mapWithConcurrency(files, READ_CONCURRENCY, async file => {
      this.openable.addFileAndParent(file.jsonPath)
      if (file.csvExists) this.openable.addFileAndParent(file.csvPath)
      try {
        const report = await readRunReportMeta(file.jsonPath, this.fs)
        return buildRunReportSummary(file, report)
      } catch {
        unreadable.push(file.file)
        return undefined
      }
    })

    const items = results.filter((item): item is RunReportSummary => item !== undefined)
    return { directory: this.reportsDir, directoryExists, items, unreadable, truncated }
  }

  async get(file: string): Promise<RunReportDetail> {
    if (!isRunReportFileName(file)) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: `Not a run report filename: ${file}` })
    }
    const jsonPath = posixJoin(this.reportsDir, file)
    const csvPath = buildCsvSiblingPath(jsonPath)
    this.openable.addFileAndParent(jsonPath)
    this.openable.addFileAndParent(csvPath)

    if (!(await this.fs.exists(jsonPath))) {
      throw new TRPCError({ code: 'NOT_FOUND', message: `No run report named ${file}` })
    }
    const csvExists = await this.fs.exists(csvPath)
    const report = await readRunReportMeta(jsonPath, this.fs)
    return {
      file,
      jsonPath,
      csvPath,
      csvExists,
      report,
      untranslatedCount: report.untranslatedCount
    }
  }

  async remove(file: string): Promise<{ removed: string[] }> {
    if (!isRunReportFileName(file)) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: `Not a run report filename: ${file}` })
    }
    const jsonPath = posixJoin(this.reportsDir, file)
    if (!(await this.fs.exists(jsonPath))) {
      throw new TRPCError({ code: 'NOT_FOUND', message: `No run report named ${file}` })
    }

    await this.fs.unlink(jsonPath)
    const removed = [jsonPath]
    const csvPath = buildCsvSiblingPath(jsonPath)
    if (await this.tryUnlink(csvPath)) removed.push(csvPath)
    return { removed }
  }

  private async tryUnlink(path: string): Promise<boolean> {
    try {
      await this.fs.unlink(path)
      return true
    } catch {
      return false
    }
  }
}

export function createRunReportsService(
  openable: OpenableRegistry,
  userDataPath: string
): RunReportsService {
  return new RunReportsService(posixJoin(userDataPath, 'reports'), openable)
}
