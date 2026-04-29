import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@ptt/ui/components/button'

import { trpc } from '@renderer/lib/trpc'
import { canRun, useConverterFormStore } from '@renderer/store/converter-form'
import { useJobsStore } from '@renderer/store/jobs'

export function RunButton() {
  const { t } = useTranslation()
  const form = useConverterFormStore()
  const startJob = useJobsStore(s => s.startJob)

  const runMutation = trpc.converter.run.useMutation({
    onSuccess: ({ jobId }) => {
      startJob(jobId)
    },
    onError: err => {
      // Most common cause: another job already running (CONFLICT).
      toast.error(t('converter.runError', { message: err.message }))
    }
  })

  const handleRun = (): void => {
    if (!canRun(form) || !form.selectedGameId) return
    runMutation.mutate({
      gameId: form.selectedGameId,
      rootDir: form.modFolder,
      sourceLanguage: form.sourceLanguage,
      targetLanguages: Array.from(form.targetLanguages),
      mode: form.mode,
      overwrite: form.overwrite,
      ...(form.mode === 'extract-to-folder' && { outputDir: form.outputFolder })
    })
  }

  return (
    <Button
      type="button"
      onClick={handleRun}
      disabled={!canRun(form) || runMutation.isPending}
      className="w-full"
      size="lg"
    >
      {runMutation.isPending ? t('converter.starting') : t('converter.convert')}
    </Button>
  )
}
