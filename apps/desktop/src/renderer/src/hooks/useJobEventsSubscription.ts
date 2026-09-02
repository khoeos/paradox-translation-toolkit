import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { useConverterFormStore } from '@renderer/store/converter-form'
import { isJobEvent, useJobsStore } from '@renderer/store/jobs'

export function useJobEventsSubscription(): void {
  const { t } = useTranslation()
  const applyEvent = useJobsStore(s => s.applyEvent)
  const setScannedMods = useConverterFormStore(s => s.setScannedMods)

  useEffect(() => {
    const off = window.api.onJobEvent(payload => {
      if (!isJobEvent(payload)) return
      applyEvent(payload)
      if (payload.type === 'convert-done') {
        toast.success(t('modal.doneToast', { count: payload.output.totals.created }))
      } else if (payload.type === 'mods-scanned') {
        setScannedMods(payload.output.mods)
        toast.success(t('modal.scanToast', { count: payload.output.totals.missingFiles }))
      } else if (payload.type === 'error') {
        toast.error(t('modal.errorToast', { message: payload.message }))
      }
    })
    return off
  }, [applyEvent, setScannedMods, t])
}
