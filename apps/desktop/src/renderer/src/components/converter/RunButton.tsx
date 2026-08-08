import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@ptt/ui/components/button'

import { trpc } from '@renderer/lib/trpc'
import {
  canConvertSelection,
  canRun,
  runTranslateConfig,
  useConverterFormStore
} from '@renderer/store/converter-form'
import { useJobsStore } from '@renderer/store/jobs'

/**
 * Start a run.
 *
 * The generated translation mod is a two-step affair, ported from PR #4 (e21ee7a) by
 * Artem Kondrashev: scan first, tick what is worth doing, then convert. That matters because a
 * local translation runs at a few lines per second, so committing to a whole collection blind is
 * not a reasonable thing to ask. The two file-level modes keep their single button.
 */
export function RunButton() {
  const { t } = useTranslation()
  // Only what the button renders from. Subscribing to the whole store re-rendered it on every
  // keystroke in the API key, model and base URL fields and on every checkbox in a
  // several-hundred-mod list, all of which now live in this same store.
  const mode = useConverterFormStore(s => s.mode)
  const scannedCount = useConverterFormStore(s => s.scannedMods.length)
  const selectedCount = useConverterFormStore(s => s.selectedMods.size)
  const setScannedMods = useConverterFormStore(s => s.setScannedMods)
  const startJob = useJobsStore(s => s.startJob)

  const onError = (message: string): void => {
    // Most common cause: another job already running (CONFLICT).
    toast.error(t('converter.runError', { message }))
  }

  const runMutation = trpc.converter.run.useMutation({
    onSuccess: ({ jobId }) => startJob(jobId),
    onError: err => onError(err.message)
  })
  const scanModsMutation = trpc.converter.scanMods.useMutation({
    onSuccess: ({ jobId }) => startJob(jobId),
    onError: err => onError(err.message)
  })
  const convertMutation = trpc.converter.convert.useMutation({
    onSuccess: ({ jobId }) => startJob(jobId),
    onError: err => onError(err.message)
  })

  const pending = runMutation.isPending || scanModsMutation.isPending || convertMutation.isPending
  const isModPipeline = mode === 'create-translation-mod'
  const needsScan = isModPipeline && scannedCount === 0

  const handleClick = (): void => {
    // Read on click rather than subscribed to: the run needs the whole form, but nothing here
    // has to re-render when a field the button does not display changes.
    const form = useConverterFormStore.getState()
    if (!canRun(form) || !form.selectedGameId) return
    const translate = runTranslateConfig(form)
    const common = {
      gameId: form.selectedGameId,
      rootDir: form.modFolder,
      sourceLanguage: form.sourceLanguage,
      targetLanguages: [...form.targetLanguages]
    }

    if (!isModPipeline) {
      runMutation.mutate({
        ...common,
        mode: form.mode,
        overwrite: form.overwrite,
        ...(form.mode === 'extract-to-folder' && { outputDir: form.outputFolder })
      })
      return
    }

    if (needsScan) {
      scanModsMutation.mutate({
        ...common,
        ...(form.modName.length > 0 && { modName: form.modName }),
        ...(translate !== undefined && { translate })
      })
      return
    }

    convertMutation.mutate({
      ...common,
      mode: form.mode,
      selectedMods: [...form.selectedMods],
      ...(form.modName.length > 0 && { modName: form.modName }),
      ...(translate !== undefined && { translate })
    })
  }

  const label = (): string => {
    if (pending) return t('converter.starting')
    if (!isModPipeline) return t('converter.convert')
    if (needsScan) return t('converter.scan')
    return t('converter.convertSelection', { count: selectedCount })
  }

  const canStart = useConverterFormStore(needsScan ? canRun : canConvertSelection)
  const disabled = pending || !canStart

  return (
    <div className="space-y-2">
      <Button type="button" onClick={handleClick} disabled={disabled} className="w-full" size="lg">
        {label()}
      </Button>
      {isModPipeline && !needsScan ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full"
          onClick={() => setScannedMods([])}
        >
          {t('converter.rescan')}
        </Button>
      ) : null}
    </div>
  )
}
