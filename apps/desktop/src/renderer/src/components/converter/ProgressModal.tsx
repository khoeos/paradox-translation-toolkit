import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import type { ConversionOutput, ScanOutput } from '@ptt/converter-core'
import { PROVIDER_DEFAULTS } from '@ptt/translate-core/defaults'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '@ptt/ui/components/accordion'
import { Button } from '@ptt/ui/components/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@ptt/ui/components/dialog'
import { Progress } from '@ptt/ui/components/progress'

import { estimateDuration } from '@renderer/lib/estimate'
import { trpc } from '@renderer/lib/trpc'
import { useConverterFormStore } from '@renderer/store/converter-form'
import type { JobState, JobStatus } from '@renderer/store/jobs'
import { useJobsStore } from '@renderer/store/jobs'

import { VirtualizedFileList } from './VirtualizedFileList'

/** Statuses during which the modal must not be dismissed. */
const RUNNING_STATUSES = new Set<JobStatus>([
  'scanning',
  'processing-mods',
  'translating',
  'applying'
])

/** A bar with nothing to measure still has to move, so each phase has a floor. */
const PHASE_FLOOR: Partial<Record<JobStatus, number>> = {
  scanning: 25,
  'processing-mods': 50,
  translating: 60,
  applying: 75
}

function progressFor(job: JobState): number {
  if (job.status === 'done' || job.status === 'scan-finished') return 100
  if (job.modsTotal > 0) return (job.modsProcessed / job.modsTotal) * 100
  if (job.status === 'scanning' && job.scanTotal > 0) {
    return (job.scanProcessed / job.scanTotal) * 100
  }
  if (job.status === 'applying' && job.applyTotal > 0) {
    return (job.applyProcessed / job.applyTotal) * 100
  }
  return PHASE_FLOOR[job.status] ?? 0
}

const DURATION_FORMATTER = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })

const TIME_FORMATTER = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false
})

type FilesByLanguageKind = 'created' | 'overwritten'

const SECTION_I18N: Record<FilesByLanguageKind, { title: string; perLang: string }> = {
  created: { title: 'modal.filesCreated', perLang: 'modal.filesPerLang' },
  overwritten: { title: 'modal.filesOverwritten', perLang: 'modal.overwrittenPerLang' }
}

interface FilesByLanguageSectionProps {
  kind: FilesByLanguageKind
  files: Partial<Record<string, string[]>>
  onPick: (dir: string) => void
}

function FilesByLanguageSection({ kind, files, onPick }: FilesByLanguageSectionProps) {
  const { t } = useTranslation()
  const entries = Object.entries(files)
  if (entries.length === 0) return null
  const keys = SECTION_I18N[kind]

  return (
    <div className="border rounded bg-muted/30">
      <div className="px-3 py-3 text-sm font-semibold">{t(keys.title)}</div>
      <Accordion type="multiple" className="border-none">
        {entries.map(([lang, langFiles]) => (
          <AccordionItem key={`${kind}-${lang}`} value={`${kind}-${lang}`}>
            <AccordionTrigger>
              {t(keys.perLang, {
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
  const progressValue = progressFor(job)

  const handleClose = (): void => {
    if (!isRunning) setActive(null)
  }

  const handleCancel = (): void => {
    cancelMutation.mutate({ jobId: job.jobId })
  }

  const created = job.report?.created ?? {}
  const overwritten = job.report?.overwritten ?? {}
  const hasResults = Object.keys(created).length > 0 || Object.keys(overwritten).length > 0

  return (
    <Dialog open={true} onOpenChange={open => !open && handleClose()}>
      <DialogContent
        closable={!isRunning}
        onPointerDownOutside={e => isRunning && e.preventDefault()}
        onEscapeKeyDown={e => isRunning && e.preventDefault()}
        className="max-w-4xl!"
      >
        <DialogHeader>
          <DialogTitle>{t(`modal.status.${job.status}`)}</DialogTitle>
        </DialogHeader>

        {isRunning ? <Progress value={progressValue} /> : null}

        {job.modsTotal > 0 && isRunning ? (
          <p className="text-sm text-muted-foreground">
            {t('modal.modProgress', {
              processed: job.modsProcessed,
              total: job.modsTotal,
              name: job.currentMod ?? ''
            })}
          </p>
        ) : null}

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
          <div className="space-y-3">
            <FilesByLanguageSection
              kind="created"
              files={created}
              onPick={dir => openPath.mutate({ path: dir })}
            />
            <FilesByLanguageSection
              kind="overwritten"
              files={overwritten}
              onPick={dir => openPath.mutate({ path: dir })}
            />
          </div>
        ) : null}

        {job.status === 'done' && !hasResults ? (
          <p className="text-sm text-muted-foreground">{t('modal.noFilesNeeded')}</p>
        ) : null}

        <div className="border rounded bg-muted/30 max-h-32 overflow-auto p-2">
          <code className="text-xs space-y-1 block">
            {job.log.map((entry, i) => (
              <div key={i} className="flex gap-3">
                <span className="text-muted-foreground">{TIME_FORMATTER.format(entry.ts)}</span>
                <span>{entry.message}</span>
              </div>
            ))}
          </code>
        </div>

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

interface ScanSummaryProps {
  output: ScanOutput
}

/**
 * What a read-only scan found, and roughly how long translating it would take.
 *
 * Ported from PR #4 (e21ee7a) by Artem Kondrashev. The estimate divides the translatable lines by
 * a per-provider rate, which the original itself described as an order of magnitude: it is there
 * to tell minutes from hours, not to promise a finish time.
 */
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
        {/* `coveredKeys` only: `englishKeys` are the ones an earlier run left in the source
            language, so counting them as covered overstates the coverage by exactly the number
            of strings that still need work. */}
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
  const openPath = trpc.fs.openPath.useMutation()
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
          onClick={() => openPath.mutate({ path: output.reportPath ?? '' })}
        >
          {t('modal.conversionSummary.openReport')}
        </Button>
      ) : null}
    </div>
  )
}
