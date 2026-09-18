import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { isLanguageCode } from '@ptt/shared/languages'
import {
  PROVIDER_DEFAULTS,
  TRANSLATE_LIMITS,
  TRANSLATE_PROVIDERS,
  hasModelList
} from '@ptt/translate/defaults'
import { Button } from '@ptt/ui/components/button'
import { Input } from '@ptt/ui/components/input'
import { Label } from '@ptt/ui/components/label'
import { Switch } from '@ptt/ui/components/switch'

import { KnownPathsPicker } from '@renderer/components/converter/KnownPathsPicker'
import { ModelPicker } from '@renderer/components/converter/ModelPicker'
import { trpc } from '@renderer/lib/trpc'
import { RESULT_TOAST_DURATION_MS } from '@renderer/lib/toast'
import { runTranslateConfig, useConverterFormStore } from '@renderer/store/converter-form'


export function TranslateSettings() {
  const { t } = useTranslation()
  const gamePathInputId = useId()
  const retranslateOwnKeysId = useId()
  const translate = useConverterFormStore(s => s.translate)
  const apiKey = useConverterFormStore(s => s.apiKey)
  const setTranslate = useConverterFormStore(s => s.setTranslate)
  const setProvider = useConverterFormStore(s => s.setTranslateProvider)
  const setApiKey = useConverterFormStore(s => s.setApiKey)
  const gameId = useConverterFormStore(s => s.selectedGameId)
  const targets = useConverterFormStore(s => s.targets)
  const retranslateOwnKeys = useConverterFormStore(s => s.retranslateOwnKeys)
  const setRetranslateOwnKeys = useConverterFormStore(s => s.setRetranslateOwnKeys)

  const defaults = PROVIDER_DEFAULTS[translate.provider]

  const testProvider = trpc.translate.testProvider.useMutation({
    onSuccess: result => {
      if (!result.ok) {
        toast.error(t('translate.testFailed', { message: result.error ?? '' }), {
          duration: RESULT_TOAST_DURATION_MS
        })
        return

      }
      if (result.markupKept === false) {
        toast.warning(t('translate.testMarkupLost'), {
          duration: RESULT_TOAST_DURATION_MS,
          description: t('translate.testMarkupLostDetail', {
            source: result.markupSource ?? '',
            text: result.markupAnswer ?? ''
          })
        })
        return
      }
      toast.success(t('translate.testOk', { text: result.translated ?? '' }), {
        duration: RESULT_TOAST_DURATION_MS,
        description: t('translate.testMarkupOk', { text: result.markupAnswer ?? '' })
      })


    },

    onError: error => toast.error(t('translate.testFailed', { message: error.message }))
  })

  const clearMemory = trpc.translate.clearMemory.useMutation({
    onSuccess: () => toast.success(t('translate.memoryCleared')),
    onError: error => toast.error(error.message)
  })

  const probeLanguage = targets.map(target => target.language).find(isLanguageCode)

  return (
    <section className="space-y-3 rounded-md border p-3">
      <div className="flex items-center justify-between">
        <Label htmlFor="translate-enabled" className="font-semibold tracking-wider">
          {t('translate.title')}
        </Label>
        <Switch
          id="translate-enabled"
          checked={translate.enabled}
          onCheckedChange={enabled => setTranslate({ enabled })}
        />
      </div>
      <p className="text-xs text-muted-foreground">{t('translate.hint')}</p>

      {translate.enabled ? (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {TRANSLATE_PROVIDERS.map(provider => (
              <Button
                key={provider}
                type="button"
                variant={translate.provider === provider ? 'default' : 'outline'}
                onClick={() => setProvider(provider)}
              >
                {t(`translate.providers.${provider}`)}
              </Button>
            ))}
          </div>

          <div className="space-y-1">
            <Label htmlFor="translate-base-url">{t('translate.baseUrl')}</Label>
            <Input
              id="translate-base-url"
              value={translate.baseUrl}
              onChange={event => setTranslate({ baseUrl: event.target.value })}
              placeholder={defaults.baseUrl}
            />
          </div>

          {defaults.fixedModel ? null : (
            <div className="space-y-1">
              <Label htmlFor="translate-model">{t('translate.model')}</Label>
              {hasModelList(translate.provider) ? (
                <ModelPicker
                  id="translate-model"
                  provider={translate.provider}
                  baseUrl={translate.baseUrl}
                  apiKey={apiKey}
                  value={translate.model}
                  placeholder={defaults.model}
                  onChange={model => setTranslate({ model })}
                />
              ) : (
                <Input
                  id="translate-model"
                  value={translate.model}
                  onChange={event => setTranslate({ model: event.target.value })}
                  placeholder={defaults.model}
                />
              )}
              <p className="text-xs text-muted-foreground">{t('translate.modelHint')}</p>
            </div>
          )}

          {defaults.needsApiKey ? (
            <div className="space-y-1">
              <Label htmlFor="translate-api-key">{t('translate.apiKey')}</Label>
              <Input
                id="translate-api-key"
                type="password"
                autoComplete="off"
                value={apiKey}
                onChange={event => setApiKey(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">{t('translate.apiKeyHint')}</p>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-2">
            <NumberField
              id="translate-batch"
              label={t('translate.batchSize')}
              value={translate.batchSize}
              limits={TRANSLATE_LIMITS.batchSize}
              onChange={batchSize => setTranslate({ batchSize })}
            />
            <NumberField
              id="translate-concurrency"
              label={t('translate.concurrency')}
              value={translate.concurrency}
              limits={TRANSLATE_LIMITS.concurrency}
              onChange={concurrency => setTranslate({ concurrency })}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor={gamePathInputId}>{t('translate.gamePath')}</Label>
            {gameId === null ? (
              <Input
                id={gamePathInputId}
                value=""
                disabled
                placeholder={t('translate.gamePathPlaceholder')}
              />
            ) : (
              <KnownPathsPicker
                id={gamePathInputId}
                gameId={gameId}
                kind="gameInstall"
                value={translate.gamePath ?? ''}
                onChange={gamePath => setTranslate({ gamePath })}
              />
            )}
            <p className="text-xs text-muted-foreground">{t('translate.gamePathHint')}</p>
          </div>

          <div className="flex items-center justify-between gap-2">
            <Label htmlFor={retranslateOwnKeysId} className="font-normal">
              {t('translate.retranslateOwnKeys')}
            </Label>
            <Switch
              id={retranslateOwnKeysId}
              checked={retranslateOwnKeys}
              onCheckedChange={setRetranslateOwnKeys}
            />
          </div>
          <p className="text-xs text-muted-foreground">{t('translate.retranslateOwnKeysHint')}</p>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={gameId === null || probeLanguage === undefined || testProvider.isPending}
              onClick={() => {
                const config = runTranslateConfig(useConverterFormStore.getState())
                if (!config || gameId === null || probeLanguage === undefined) return
                testProvider.mutate({ gameId, targetLanguage: probeLanguage, config })
              }}
            >
              {t('translate.test')}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={clearMemory.isPending}
              onClick={() => clearMemory.mutate(gameId === null ? {} : { gameId })}
            >
              {t('translate.clearMemory')}
            </Button>
            {probeLanguage === undefined ? (
              <p className="text-xs text-muted-foreground">{t('translate.testNeedsBuiltIn')}</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  )
}

interface NumberFieldProps {
  id: string
  label: string
  value: number
  limits: { min: number; max: number }
  onChange: (value: number) => void
}

function NumberField({ id, label, value, limits, onChange }: NumberFieldProps) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        min={limits.min}
        max={limits.max}
        value={value}
        onChange={event => {
          const parsed = Number.parseInt(event.target.value, 10)
          if (Number.isNaN(parsed)) return
          onChange(Math.min(Math.max(parsed, limits.min), limits.max))
        }}
      />
    </div>
  )
}
