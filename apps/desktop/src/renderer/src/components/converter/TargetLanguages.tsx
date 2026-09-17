import { useTranslation } from 'react-i18next'

import { Badge } from '@ptt/ui/components/badge'
import { Label } from '@ptt/ui/components/label'
import { Switch } from '@ptt/ui/components/switch'

import { useTargetValidation } from '@renderer/hooks/useTargetValidation'
import { buildTargetGrid, languageLabel, targetLabel } from '@renderer/lib/targets'
import { useConverterFormStore } from '@renderer/store/converter-form'

import { CustomTargetDialog } from './CustomTargetDialog'

export function TargetLanguages() {
  const { t } = useTranslation()
  const targets = useConverterFormStore(s => s.targets)
  const sourceLanguage = useConverterFormStore(s => s.sourceLanguage)
  const toggle = useConverterFormStore(s => s.toggleTargetLanguage)
  const removeTarget = useConverterFormStore(s => s.removeTarget)
  const { game, tokens, error, warning } = useTargetValidation()

  if (!game) {
    return <p className="text-sm text-muted-foreground">{t('converter.noLanguagesPickGame')}</p>
  }

  const grid = buildTargetGrid(targets, tokens)

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
        {game.languages.map(lang => {
          const ownToken = tokens[lang]
          if (ownToken === undefined) return null

          const id = `target-lang-${lang}`
          const isSource = lang === sourceLanguage
          const active = grid.builtIn.get(lang)
          const claimed = grid.claimed.has(lang)
          const claimedBy = claimed
            ? grid.extra.find(target => target.language === lang)
            : undefined
          return (
            <div
              key={lang}
              className="flex items-center justify-between"
              {...(claimedBy !== undefined && {
                title: t('converter.customTarget.languageClaimed', {
                  language: languageLabel(t, lang),
                  token: claimedBy.fileToken
                })
              })}
            >
              <Label htmlFor={id} className={isSource || claimed ? 'opacity-60' : ''}>
                {active ? targetLabel(t, active, tokens) : t(`languages.${lang}`)}
              </Label>
              <Switch
                id={id}
                checked={active !== undefined}
                disabled={isSource || claimed}
                onCheckedChange={() => toggle(lang, ownToken)}
              />
            </div>
          )
        })}
      </div>

      {grid.extra.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {grid.extra.map(target => (
            <Badge
              key={`${target.language}:${target.fileToken}`}
              variant="outline"
              className="gap-1 py-1"
            >
              {targetLabel(t, target, tokens)}
              <button
                type="button"
                aria-label={t('converter.customTarget.remove')}
                className="opacity-70 hover:opacity-100"
                onClick={() => removeTarget(target.language)}
              >
                ×
              </button>
            </Badge>
          ))}
        </div>
      ) : null}

      <CustomTargetDialog />

      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      {!error && warning ? (
        <p className="text-xs text-amber-600 dark:text-amber-500">{warning}</p>
      ) : null}
    </div>
  )
}
