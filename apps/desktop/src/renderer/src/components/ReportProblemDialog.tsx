import { useRouterState } from '@tanstack/react-router'
import { MessagesSquare } from 'lucide-react'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@ptt/ui/components/button'
import { Checkbox } from '@ptt/ui/components/checkbox'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@ptt/ui/components/dialog'
import { Input } from '@ptt/ui/components/input'
import { Label } from '@ptt/ui/components/label'
import { Textarea } from '@ptt/ui/components/textarea'

import { DISCORD_INVITE_URL } from '@renderer/lib/links'
import {
  formatReportJobs,
  formatReportPage,
  formatReportPaths,
  formatReportSettings
} from '@renderer/lib/report-context'
import { trpc } from '@renderer/lib/trpc'
import { useConverterFormStore } from '@renderer/store/converter-form'
import { useJobsStore } from '@renderer/store/jobs'

interface ReportProblemDialogProps {
  trigger: (open: () => void) => ReactNode
}

export function ReportProblemDialog({ trigger }: ReportProblemDialogProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [contact, setContact] = useState('')
  const [includeTechnical, setIncludeTechnical] = useState(false)

  const pathname = useRouterState({ select: state => state.location.pathname })
  const selectedGameId = useConverterFormStore(state => state.selectedGameId)
  const { data: settings } = trpc.settings.getAll.useQuery()
  const jobs = useJobsStore(state => state.jobs)

  const send = trpc.report.send.useMutation({
    onSuccess: () => {
      toast.success(t('report.success'))
      setMessage('')
      setContact('')
      setIncludeTechnical(false)
      setOpen(false)
    },
    onError: err => toast.error(t('report.error', { message: err.message }))
  })

  const handleSubmit = (): void => {
    if (!settings || message.trim().length === 0) return
    const technical = includeTechnical
      ? {
          paths: formatReportPaths(settings),
          jobs: formatReportJobs([...jobs.values()])
        }
      : undefined
    send.mutate({
      message: message.trim(),
      ...(contact.trim() ? { contact: contact.trim() } : {}),
      page: formatReportPage(pathname, selectedGameId),
      settings: formatReportSettings(settings),
      ...(technical ? { technical } : {})
    })
  }

  return (
    <>
      {trigger(() => setOpen(true))}
      <Dialog open={open} onOpenChange={next => setOpen(next)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('report.title')}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="report-message">{t('report.messageLabel')}</Label>
              <Textarea
                id="report-message"
                value={message}
                onChange={event => setMessage(event.target.value)}
                placeholder={t('report.messagePlaceholder')}
                rows={5}
                maxLength={4000}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="report-contact">{t('report.contactLabel')}</Label>
              <Input
                id="report-contact"
                value={contact}
                onChange={event => setContact(event.target.value)}
                placeholder={t('report.contactPlaceholder')}
                maxLength={200}
              />
            </div>

            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                checked={includeTechnical}
                onCheckedChange={checked => setIncludeTechnical(checked === true)}
              />
              <span className="text-muted-foreground">{t('report.includeTechnical')}</span>
            </label>
          </div>

          <DialogFooter className="sm:items-center sm:justify-between">
            <a
              href={DISCORD_INVITE_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <MessagesSquare className="h-4 w-4" />
              {t('report.discordLink')}
            </a>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button variant="outline" onClick={() => setOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={send.isPending || message.trim().length === 0}
              >
                {t('report.send')}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
