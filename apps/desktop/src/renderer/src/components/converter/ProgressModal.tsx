import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import type { ConversionOutput, ScanOutput } from '@ptt/converter'
import type { DiagnosticSeverity, ScanPhase, ScanRunningTotals } from '@ptt/converter/progress'
import type { LanguageCode } from '@ptt/shared'
import { PROVIDER_DEFAULTS } from '@ptt/translate/defaults'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '@ptt/ui/components/accordion'
import { Button } from '@ptt/ui/components/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@ptt/ui/components/dialog'
import { Progress } from '@ptt/ui/components/progress'
import { ScrollArea } from '@ptt/ui/components/scroll-area'
import { cn } from '@ptt/ui/lib/utils'

import { estimateDuration } from '@renderer/lib/estimate'
import { getLogSeverityStyle } from '@renderer/lib/log-severity'
import { formatElapsed, scanPhasePercent } from '@renderer/lib/scan-progress'
import { trpc } from '@renderer/lib/trpc'
import { useConverterFormStore } from '@renderer/store/converter-form'
import type { JobState, JobStatus, LogEntry } from '@renderer/store/jobs'
import { useJobsStore } from '@renderer/store/jobs'

import { VirtualizedFileList } from './VirtualizedFileList'

const RUNNING_STATUSES = new Set<JobStatus>(['scanning', 'processing-mods', 'translating'])

const STATUS_FLOOR: Partial<Record<JobStatus, number>> = {
  scanning: 2,
  'processing-mods': 50,
  translating: 60
}

const STICK_TO_BOTTOM_PX = 24

const TICK_MS = 1000

type Translate = ReturnType<typeof useTranslation>['t']

function createdByLanguage(output: ConversionOutput): Partial<Record<LanguageCode, string[]>> {
  const merged: Partial<Record<LanguageCode, string[]>> = {}
  for (const mod of output.mods) {
    for (const [languageRaw, files] of Object.entries(mod.created)) {
      const language = languageRaw as LanguageCode
      if (!files || files.length === 0) continue
      merged[language] = [...(merged[language] ?? []), ...files]
    }
  }
  return merged
}

function progressFor(job: JobState): number {
  if (job.status === 'done' || job.status === 'scan-finished') return 100
  if (job.phase !== null && job.status !== 'translating') {
    return scanPhasePercent(job.phase, job.phaseDone, job.phaseTotal)
  }
  if (job.modsTotal > 0) return (job.modsProcessed / job.modsTotal) * 100
  return STATUS_FLOOR[job.status] ?? 0
}

function phaseLabel(t: Translate, phase: ScanPhase): string {
  switch (phase) {
    case 'reading-generated':
      return t('modal.phase.readingGenerated')
    case 'discovering':
      return t('modal.phase.discovering')
    case 'building-coverage':
      return t('modal.phase.buildingCoverage')
    case 'planning':
      return t('modal.phase.planning')
  }
}

function severityLabel(t: Translate, severity: DiagnosticSeverity): string {
  switch (severity) {
    case 'warning':
      return t('modal.log.severity.warning')
    case 'error':
      return t('modal.log.severity.error')
  }
}

const DURATION_FORMATTER = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })

const TIME_FORMATTER = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false
})

interface FilesByLanguageSectionProps {
  files: Partial<Record<string, string[]>>
  onPick: (dir: string) => void
}

function FilesByLanguageSection({ files, onPick }: FilesByLanguageSectionProps) {
  const { t } = useTranslation()
  const entries = Object.entries(files)
  if (entries.length === 0) return null

  return (
    <div className="border rounded bg-muted/30">
      <div className="px-3 py-3 text-sm font-semibold">{t('modal.filesCreated')}</div>
      <Accordion multiple className="border-none">
        {entries.map(([lang, langFiles]) => (
          <AccordionItem key={lang} value={lang}>
            <AccordionTrigger>
              {t('modal.filesPerLang', {
                lang: t(`languages.${lang}`),
                count: langFiles?.length ?? 0
              })}
            </AccordionTrigger>
            <AccordionContent>
              <VirtualizedFileList files={langFiles ?? []} onPick={onPick} />
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  )
}

export function ProgressModal() {
  const { t } = useTranslation()
  const activeJobId = useJobsStore(s => s.activeJobId)
  const job = useJobsStore(s => (activeJobId ? s.jobs.get(activeJobId) : null))
  const setActive = useJobsStore(s => s.setActive)
  const cancelMutation = trpc.converter.cancel.useMutation()
  const openPath = trpc.fs.openPath.useMutation({
    onError: err => {
      toast.error(t('modal.openPathError', { message: err.message }))
    }
  })

  if (!job) return null

  const isRunning = RUNNING_STATUSES.has(job.status)

  const handleClose = (): void => {
    if (!isRunning) setActive(null)
  }

  const handleCancel = (): void => {
    cancelMutation.mutate({ jobId: job.jobId })
  }

  const created = job.conversion ? createdByLanguage(job.conversion) : {}
  const hasResults = Object.keys(created).length > 0

  return (
    <Dialog
      open={true}
      onOpenChange={(open, eventDetails) => {
        if (open) return
        const dismissed =
          eventDetails.reason === 'outside-press' || eventDetails.reason === 'escape-key'
        if (isRunning && dismissed) {
          eventDetails.cancel()
          return
        }
        handleClose()
      }}
    >
      <DialogContent closable={!isRunning} className="max-w-4xl!">
        <DialogHeader>
          <DialogTitle>{t(`modal.status.${job.status}`)}</DialogTitle>
        </DialogHeader>

        {isRunning ? <RunningProgress job={job} /> : null}

        {job.totals && !job.scanOutput ? <ScanTally totals={job.totals} /> : null}

        {job.translation ? (
          <p className="text-sm text-muted-foreground">
            {t('modal.translationCounters', {
              translated: job.translation.translated,
              cached: job.translation.cached,
              failed: job.translation.failed
            })}
          </p>
        ) : null}

        {job.scanOutput ? <ScanSummary output={job.scanOutput} /> : null}

        {job.conversion ? <ConversionSummary output={job.conversion} /> : null}

        {job.errorMessage ? <p className="text-sm text-destructive">{job.errorMessage}</p> : null}

        {job.status === 'done' && hasResults ? (
          <FilesByLanguageSection files={created} onPick={dir => openPath.mutate({ path: dir })} />
        ) : null}

        {job.status === 'done' && !hasResults ? (
          <p className="text-sm text-muted-foreground">{t('modal.noFilesNeeded')}</p>
        ) : null}

        <LogPanel entries={job.log} />

        <div className="flex justify-end gap-2">
          {isRunning ? (
            <Button variant="outline" onClick={handleCancel}>
              {t('common.cancel')}
            </Button>
          ) : (
            <Button onClick={handleClose}>{t('common.close')}</Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

interface RunningProgressProps {
  job: JobState
}

function RunningProgress({ job }: RunningProgressProps) {
  const { t } = useTranslation()
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(id)
  }, [])

  const counted = job.phaseTotal !== null && job.phaseTotal > 0
  const phase = job.phase
  let activity: string | null = null
  if (phase !== null) {
    const counters = counted ? ` ${job.phaseDone ?? 0}/${job.phaseTotal}` : ''
    const lastMod = job.currentMod ? ` - ${job.currentMod}` : ''
    activity = `${phaseLabel(t, phase)}${counters}${lastMod}`
  } else if (job.modsTotal > 0) {
    activity = t('modal.modProgress', {
      processed: job.modsProcessed,
      total: job.modsTotal,
      name: job.currentMod ?? ''
    })
  }

  return (
    <div className="space-y-2">
      <Progress value={progressFor(job)} />
      <div className="flex items-baseline justify-between gap-3 text-sm text-muted-foreground">
        <span className="truncate">{activity}</span>
        <span className="shrink-0 tabular-nums" title={t('modal.elapsed')}>
          {formatElapsed(now - job.startedAt)}
        </span>
      </div>
    </div>
  )
}

interface ScanTallyProps {
  totals: ScanRunningTotals
}

function ScanTally({ totals }: ScanTallyProps) {
  const { t } = useTranslation()

  return (
    <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
      <span>{t('modal.tally.files', { count: totals.files })}</span>
      <span>{t('modal.tally.toCreate', { count: totals.missingFiles })}</span>
      <span>{t('modal.tally.lines', { count: totals.missingLines })}</span>
      {totals.warnings > 0 ? (
        <span className="text-amber-600 dark:text-amber-500">
          {t('modal.tally.warnings', { count: totals.warnings })}
        </span>
      ) : null}
      {totals.errors > 0 ? (
        <span className="text-destructive">
          {t('modal.tally.errors', { count: totals.errors })}
        </span>
      ) : null}
    </p>
  )
}

interface LogPanelProps {
  entries: LogEntry[]
}

function LogPanel({ entries }: LogPanelProps) {
  const { t } = useTranslation()
  const contentRef = useRef<HTMLElement>(null)
  const followRef = useRef(true)
  const lineCount = entries.length

  useEffect(() => {
    const viewport = contentRef.current?.closest('[data-slot="scroll-area-viewport"]')
    if (!(viewport instanceof HTMLElement)) return undefined
    const handleScroll = (): void => {
      followRef.current =
        viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <= STICK_TO_BOTTOM_PX
    }
    viewport.addEventListener('scroll', handleScroll, { passive: true })
    return () => viewport.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    if (!followRef.current) return
    const viewport = contentRef.current?.closest('[data-slot="scroll-area-viewport"]')
    if (viewport instanceof HTMLElement) viewport.scrollTop = viewport.scrollHeight
  }, [lineCount])

  return (
    <ScrollArea className="h-56 rounded-md border bg-muted/30">
      <code ref={contentRef} className="block space-y-1 p-2 text-xs">
        {entries.map((entry, i) => {
          const severityStyle = getLogSeverityStyle(entry.severity)
          return (
            <div key={i} className="flex gap-2">
              <span className="shrink-0 text-muted-foreground">
                {TIME_FORMATTER.format(entry.ts)}
              </span>
              <span aria-hidden="true" className={cn('w-3 shrink-0', severityStyle.className)}>
                {severityStyle.marker}
              </span>
              <span className={cn('break-all', severityStyle.className)}>
                {entry.severity ? (
                  <span className="sr-only">{severityLabel(t, entry.severity)} </span>
                ) : null}
                {entry.message}
              </span>
            </div>
          )
        })}
      </code>
    </ScrollArea>
  )
}

interface ScanSummaryProps {
  output: ScanOutput
}

function ScanSummary({ output }: ScanSummaryProps) {
  const { t } = useTranslation()
  const provider = useConverterFormStore(s => s.translate.provider)
  const translateEnabled = useConverterFormStore(s => s.translate.enabled)
  const { totals } = output

  const estimate =
    translateEnabled && totals.missingLines > 0
      ? estimateDuration(totals.missingLines, PROVIDER_DEFAULTS[provider].linesPerSecond)
      : null

  return (
    <div className="space-y-1 rounded-md border p-3 text-sm">
      <p>{t('modal.scanSummary.mods', { count: totals.mods })}</p>
      <p>
        {t('modal.scanSummary.missing', {
          files: totals.missingFiles,
          keys: totals.coveredKeys
        })}
      </p>
      {totals.withoutLocalisation > 0 ? (
        <p className="text-muted-foreground">
          {t('modal.scanSummary.withoutLocalisation', { count: totals.withoutLocalisation })}
        </p>
      ) : null}
      {totals.otherSpelling > 0 ? (
        <p className="text-amber-600 dark:text-amber-500">
          {t('modal.scanSummary.otherSpelling', { count: totals.otherSpelling })}
        </p>
      ) : null}
      {output.selfCopy ? (
        <p className="text-muted-foreground">{t('modal.scanSummary.selfCopy')}</p>
      ) : null}
      {output.generatedMod ? (
        <p className="text-muted-foreground">
          {t('modal.scanSummary.generated', {
            translated: output.generatedMod.translated,
            english: output.generatedMod.english,
            orphans: output.generatedMod.orphanNamespaces.length
          })}
        </p>
      ) : null}
      {estimate ? (
        <p className="font-medium">
          {t('modal.scanSummary.estimate', {
            lines: totals.missingLines,
            duration: DURATION_FORMATTER.format(estimate.value, estimate.unit)
          })}
        </p>
      ) : null}
    </div>
  )
}

interface ConversionSummaryProps {
  output: ConversionOutput
}

function ConversionSummary({ output }: ConversionSummaryProps) {
  const { t } = useTranslation()
  const openPath = trpc.fs.openPath.useMutation({
    onError: err => {
      toast.error(t('modal.openPathError', { message: err.message }))
    }
  })
  const showItemInFolder = trpc.fs.showItemInFolder.useMutation({
    onError: err => {
      toast.error(t('modal.openPathError', { message: err.message }))
    }
  })
  const { totals } = output

  return (
    <div className="space-y-1 rounded-md border p-3 text-sm">
      <p>{t('modal.conversionSummary.created', { count: totals.created })}</p>
      {totals.skipped > 0 ? (
        <p className="text-muted-foreground">
          {t('modal.conversionSummary.skipped', { count: totals.skipped })}
        </p>
      ) : null}
      {totals.pruned > 0 ? (
        <p className="text-muted-foreground">
          {t('modal.conversionSummary.pruned', { count: totals.pruned })}
        </p>
      ) : null}
      {totals.failed > 0 ? (
        <p className="text-destructive">
          {t('modal.conversionSummary.failed', { count: totals.failed })}
        </p>
      ) : null}
      {output.translationMod ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => openPath.mutate({ path: output.translationMod?.path ?? '' })}
        >
          {t('modal.conversionSummary.openMod')}
        </Button>
      ) : null}
      {output.reportPath ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => showItemInFolder.mutate({ path: output.reportPath ?? '' })}
        >
          {t('modal.conversionSummary.openReport')}
        </Button>
      ) : null}
    </div>
  )
}
