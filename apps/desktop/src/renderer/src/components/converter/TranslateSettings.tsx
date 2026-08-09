import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  PROVIDER_DEFAULTS,
  TRANSLATE_LIMITS,
  TRANSLATE_PROVIDERS
} from '@ptt/translate/defaults'
import { Button } from '@ptt/ui/components/button'
import { Input } from '@ptt/ui/components/input'
import { Label } from '@ptt/ui/components/label'
import { Switch } from '@ptt/ui/components/switch'

import { trpc } from '@renderer/lib/trpc'
import { runTranslateConfig, useConverterFormStore } from '@renderer/store/converter-form'

/**
 * The optional machine-translation settings.
 *
 * Ported from PR #4 (e21ee7a, `LanguageConverter/TranslateSettings.tsx`) by Artem Kondrashev.
 * The API key is deliberately not part of the persisted settings: it lives in the store's own
 * in-memory field and is put back only for the call that needs it.
 */
export function TranslateSettings() {
  const { t } = useTranslation()
  const translate = useConverterFormStore(s => s.translate)
  const apiKey = useConverterFormStore(s => s.apiKey)
  const setTranslate = useConverterFormStore(s => s.setTranslate)
  const setProvider = useConverterFormStore(s => s.setTranslateProvider)
  const setApiKey = useConverterFormStore(s => s.setApiKey)
  const gameId = useConverterFormStore(s => s.selectedGameId)
  const targetLanguages = useConverterFormStore(s => s.targetLanguages)

  const defaults = PROVIDER_DEFAULTS[translate.provider]

  const testProvider = trpc.translate.testProvider.useMutation({
    onSuccess: result => {
      if (result.ok) toast.success(t('translate.testOk', { text: result.translated ?? '' }))
      else toast.error(t('translate.testFailed', { message: result.error ?? '' }))
    },
    onError: error => toast.error(t('translate.testFailed', { message: error.message }))
  })

  const clearMemory = trpc.translate.clearMemory.useMutation({
    onSuccess: () => toast.success(t('translate.memoryCleared')),
    onError: error => toast.error(error.message)
  })

  const pickGamePath = trpc.translate.pickGamePath.useMutation({
    onSuccess: path => {
      if (path) setTranslate({ gamePath: path })
    }
  })

  const firstTarget = [...targetLanguages][0]

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
              <Input
                id="translate-model"
                value={translate.model}
                onChange={event => setTranslate({ model: event.target.value })}
                placeholder={defaults.model}
              />
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
            <Label htmlFor="translate-game-path">{t('translate.gamePath')}</Label>
            <div className="flex gap-2">
              <Input
                id="translate-game-path"
                value={translate.gamePath ?? ''}
                onChange={event => setTranslate({ gamePath: event.target.value })}
                placeholder={t('translate.gamePathPlaceholder')}
              />
              <Button type="button" variant="outline" onClick={() => pickGamePath.mutate()}>
                {t('translate.browse')}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t('translate.gamePathHint')}</p>
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={gameId === null || firstTarget === undefined || testProvider.isPending}
              onClick={() => {
                const config = runTranslateConfig(useConverterFormStore.getState())
                if (!config || gameId === null || firstTarget === undefined) return
                testProvider.mutate({ gameId, targetLanguage: firstTarget, config })
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
          // Clamped here so the same bounds hold whether the value was typed or stepped.
          onChange(Math.min(Math.max(parsed, limits.min), limits.max))
        }}
      />
    </div>
  )
}
