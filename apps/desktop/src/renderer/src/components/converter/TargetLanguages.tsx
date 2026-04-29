import { useTranslation } from 'react-i18next'

import { Label } from '@ptt/ui/components/label'
import { Switch } from '@ptt/ui/components/switch'

import { trpc } from '@renderer/lib/trpc'
import { useConverterFormStore } from '@renderer/store/converter-form'

export function TargetLanguages() {
  const { t } = useTranslation()
  const { data } = trpc.games.list.useQuery()
  const selectedGameId = useConverterFormStore(s => s.selectedGameId)
  const targetLanguages = useConverterFormStore(s => s.targetLanguages)
  const sourceLanguage = useConverterFormStore(s => s.sourceLanguage)
  const toggle = useConverterFormStore(s => s.toggleTargetLanguage)

  const game = data?.find(g => g.id === selectedGameId)
  if (!game) {
    return <p className="text-sm text-muted-foreground">{t('converter.noLanguagesPickGame')}</p>
  }

  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-3">
      {game.languages.map(lang => {
        const id = `target-lang-${lang}`
        const isSource = lang === sourceLanguage
        return (
          <div key={lang} className="flex items-center justify-between">
            <Label htmlFor={id} className={isSource ? 'opacity-60' : ''}>
              {t(`languages.${lang}`)}
            </Label>
            <Switch
              id={id}
              checked={targetLanguages.has(lang)}
              disabled={isSource}
              onCheckedChange={() => toggle(lang)}
            />
          </div>
        )
      })}
    </div>
  )
}
