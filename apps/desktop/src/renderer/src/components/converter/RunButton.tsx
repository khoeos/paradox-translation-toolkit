import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import type { LanguageCode } from '@ptt/shared'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@ptt/ui/components/alert-dialog'
import { Button } from '@ptt/ui/components/button'

import { trpc } from '@renderer/lib/trpc'
import { canRun, runTranslateConfig, useConverterFormStore } from '@renderer/store/converter-form'
import { useJobsStore } from '@renderer/store/jobs'

function commonInput(): {
  gameId: string
  rootDir: string
  sourceLanguage: LanguageCode
  targetLanguages: LanguageCode[]
  modName?: string
  translate?: NonNullable<ReturnType<typeof runTranslateConfig>>
} | null {
  const form = useConverterFormStore.getState()
  if (!canRun(form) || !form.selectedGameId) return null
  const translate = runTranslateConfig(form)
  return {
    gameId: form.selectedGameId,
    rootDir: form.modFolder,
    sourceLanguage: form.sourceLanguage,
    targetLanguages: [...form.targetLanguages],
    ...(form.modName.length > 0 && { modName: form.modName }),
    ...(translate !== undefined && { translate })
  }
}

export function RunButton() {
  const { t } = useTranslation()
  const scannedCount = useConverterFormStore(s => s.scannedMods.length)
  const selectedCount = useConverterFormStore(s => s.selectedMods.size)
  const ready = useConverterFormStore(canRun)
  const startJob = useJobsStore(s => s.startJob)
  const [confirming, setConfirming] = useState(false)
  const cancelRef = useRef<HTMLButtonElement>(null)

  const onError = (message: string): void => {
    // Most common cause: another job already running (CONFLICT).
    toast.error(t('converter.runError', { message }))
  }

  const scanModsMutation = trpc.converter.scanMods.useMutation({
    onSuccess: ({ jobId }) => startJob(jobId),
    onError: err => onError(err.message)
  })
  const convertMutation = trpc.converter.convert.useMutation({
    onSuccess: ({ jobId }) => startJob(jobId),
    onError: err => onError(err.message)
  })

  const pending = scanModsMutation.isPending || convertMutation.isPending
  const hasScan = scannedCount > 0
  const emptySelection = hasScan && selectedCount === 0

  const handleScan = (): void => {
    const input = commonInput()
    if (input) scanModsMutation.mutate(input)
  }

  const startConvert = (): void => {
    const input = commonInput()
    if (!input) return
    const form = useConverterFormStore.getState()
    convertMutation.mutate({
      ...input,
      mode: form.mode,
      ...(form.mode === 'add-to-current' && { targetContent: form.targetContent }),
      ...(hasScan && { selectedMods: [...form.selectedMods] }),
      ...(form.mode === 'extract-to-folder' && { outputDir: form.outputFolder })
    })
  }

  const handleConvert = (): void => {
    const form = useConverterFormStore.getState()
    if (form.mode === 'add-to-current' && form.targetContent === 'regenerate-file') {
      setConfirming(true)
      return
    }
    startConvert()
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      <Button
        type="button"
        variant="outline"
        onClick={handleScan}
        disabled={pending || !ready}
        size="lg"
      >
        {scanModsMutation.isPending ? t('converter.starting') : t('converter.scan')}
      </Button>
      <Button
        type="button"
        onClick={handleConvert}
        disabled={pending || !ready || emptySelection}
        className="col-span-2"
        size="lg"
      >
        {convertMutation.isPending
          ? t('converter.starting')
          : hasScan
            ? t('converter.convertSelection', { count: selectedCount })
            : t('converter.convert')}
      </Button>

      <AlertDialog open={confirming} onOpenChange={open => setConfirming(open)}>
        <AlertDialogContent initialFocus={cancelRef}>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('converter.regenerateConfirm.title')}</AlertDialogTitle>
            <AlertDialogDescription>{t('converter.regenerateConfirm.body')}</AlertDialogDescription>
          </AlertDialogHeader>
          <p className="text-xs/relaxed text-muted-foreground">
            {t('converter.regenerateConfirm.cost')}
          </p>
          <AlertDialogFooter>
            <AlertDialogCancel ref={cancelRef}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setConfirming(false)
                startConvert()
              }}
            >
              {t('converter.regenerateConfirm.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
