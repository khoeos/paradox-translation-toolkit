import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '@ptt/ui/components/accordion'
import { Button } from '@ptt/ui/components/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@ptt/ui/components/dialog'
import { Progress } from '@ptt/ui/components/progress'

import { trpc } from '@renderer/lib/trpc'
import { useJobsStore } from '@renderer/store/jobs'

import { VirtualizedFileList } from './VirtualizedFileList'

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

  const isRunning = job.status === 'scanning' || job.status === 'applying'
  const progressValue =
    job.status === 'scanning'
      ? job.scanTotal > 0
        ? (job.scanProcessed / job.scanTotal) * 100
        : 25
      : job.status === 'applying'
        ? job.applyTotal > 0
          ? (job.applyProcessed / job.applyTotal) * 100
          : 75
        : job.status === 'done'
          ? 100
          : 0

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
