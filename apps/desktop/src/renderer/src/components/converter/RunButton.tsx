import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import type { LanguageCode } from '@ptt/shared'
import type { TranslationTarget } from '@ptt/shared/languages'
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

import { useTargetValidation } from '@renderer/hooks/useTargetValidation'
import { findShadowingTarget, languageLabel } from '@renderer/lib/targets'
import { trpc } from '@renderer/lib/trpc'
import { canRun, runTranslateConfig, useConverterFormStore } from '@renderer/store/converter-form'
import { useJobsStore } from '@renderer/store/jobs'

function commonInput(): {
  gameId: string
  rootDir: string
  sourceLanguage: LanguageCode
  targets: TranslationTarget[]
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
    targets: form.targets,
    ...(form.modName.length > 0 && { modName: form.modName }),
    ...(translate !== undefined && { translate })
  }
}

export function RunButton() {
  const { t } = useTranslation()
  const targets = useConverterFormStore(s => s.targets)
  const mode = useConverterFormStore(s => s.mode)
  const targetContent = useConverterFormStore(s => s.targetContent)
  const scannedCount = useConverterFormStore(s => s.scannedMods.length)
  const selectedCount = useConverterFormStore(s => s.selectedMods.size)
  const ready = useConverterFormStore(canRun)
  const startJob = useJobsStore(s => s.startJob)
  const [confirming, setConfirming] = useState(false)
  const cancelRef = useRef<HTMLButtonElement>(null)

  const { tokens, error: targetError } = useTargetValidation()
  const blocked = targetError !== undefined

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

  const shadowing = findShadowingTarget(targets, tokens)

  const handleConvert = (): void => {
    const form = useConverterFormStore.getState()
    const replacing = form.targetContent !== 'missing-keys'
    if (
      form.mode === 'add-to-current' &&
      (form.targetContent === 'regenerate-file' || (replacing && shadowing !== undefined))
    ) {
      setConfirming(true)
      return
    }
    startConvert()
  }

  const inPlaceShadowConfirm =
    mode === 'add-to-current' && targetContent !== 'missing-keys' && shadowing !== undefined
  const ownerLabel = shadowing !== undefined ? languageLabel(t, shadowing.owner) : ''
  const shadowingLabel = shadowing !== undefined ? languageLabel(t, shadowing.target.language) : ''

  return (
    <div className="grid grid-cols-3 gap-2">
      <Button
        type="button"
        variant="outline"
        onClick={handleScan}
        disabled={pending || !ready || blocked}
        size="lg"
      >
        {scanModsMutation.isPending ? t('converter.starting') : t('converter.scan')}
      </Button>
      <Button
        type="button"
        onClick={handleConvert}
        disabled={pending || !ready || blocked || emptySelection}
        className="col-span-2"
        size="lg"
      >
        {convertMutation.isPending
          ? t('converter.starting')
          : hasScan
            ? t('converter.convertSelection', { count: selectedCount })
            : t('converter.convert')}
      </Button>

      {targetError ? <p className="col-span-3 text-xs text-destructive">{targetError}</p> : null}

      <AlertDialog open={confirming} onOpenChange={open => setConfirming(open)}>
        <AlertDialogContent initialFocus={cancelRef}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {inPlaceShadowConfirm
                ? t('converter.inPlaceShadowConfirm.title', { owner: ownerLabel })
                : t('converter.regenerateConfirm.title')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {inPlaceShadowConfirm
                ? t('converter.inPlaceShadowConfirm.body', {
                    language: shadowingLabel,
                    owner: ownerLabel
                  })
                : t('converter.regenerateConfirm.body')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <p className="text-xs/relaxed text-muted-foreground">
            {inPlaceShadowConfirm
              ? t('converter.inPlaceShadowConfirm.cost', { owner: ownerLabel })
              : t('converter.regenerateConfirm.cost')}
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
