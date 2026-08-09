import { useTranslation } from 'react-i18next'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@ptt/ui/components/select'

import { trpc } from '@renderer/lib/trpc'
import { useConverterFormStore } from '@renderer/store/converter-form'

export function SourceLanguage() {
  const { t } = useTranslation()
  const { data } = trpc.games.list.useQuery()
  const selectedGameId = useConverterFormStore(s => s.selectedGameId)
  const sourceLanguage = useConverterFormStore(s => s.sourceLanguage)
  const setSourceLanguage = useConverterFormStore(s => s.setSourceLanguage)

  const game = data?.find(g => g.id === selectedGameId)
  if (!game) return null

  return (
    <Select
      value={sourceLanguage}
      onValueChange={value => {
        // Base UI widens the callback value to `LanguageCode | null`; the select
        // is never cleared, but the null has to be ruled out rather than cast away.
        if (value !== null) setSourceLanguage(value)
      }}
    >
      <SelectTrigger className="w-full" size="default">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {game.languages.map(lang => (
          <SelectItem key={lang} value={lang}>
            {t(`languages.${lang}`)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
