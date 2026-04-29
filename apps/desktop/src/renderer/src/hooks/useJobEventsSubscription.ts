import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { isJobEvent, useJobsStore } from '@renderer/store/jobs'

export function useJobEventsSubscription(): void {
  const { t } = useTranslation()
  const applyEvent = useJobsStore(s => s.applyEvent)

  useEffect(() => {
    const off = window.api.onJobEvent(payload => {
      if (!isJobEvent(payload)) return
      applyEvent(payload)
      if (payload.type === 'done') {
        const sumLists = (buckets: Partial<Record<string, string[] | undefined>>): number =>
          Object.values(buckets).reduce((acc, list) => acc + (list?.length ?? 0), 0)
        const created = sumLists(payload.report.created)
        const overwritten = sumLists(payload.report.overwritten)
        toast.success(t('modal.doneToast', { count: created + overwritten }))
      } else if (payload.type === 'error') {
        toast.error(t('modal.errorToast', { message: payload.message }))
      }
    })
    return off
  }, [applyEvent, t])
}
