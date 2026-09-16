import { useTranslation } from 'react-i18next'

import { Card, CardContent, CardHeader } from '@ptt/ui/components/card'
import { Progress } from '@ptt/ui/components/progress'

import { getLanguageLabel } from '@renderer/components/runs/labels'
import type { getReadErrorsByLanguageFolder } from '@renderer/lib/run-errors'

type LanguageFolderEntry = ReturnType<typeof getReadErrorsByLanguageFolder>[number]

interface RunLanguageErrorsCardProps {
  entries: readonly LanguageFolderEntry[]
  sourceLanguage: string
}

export function RunLanguageErrorsCard({ entries, sourceLanguage }: RunLanguageErrorsCardProps) {
  const { t } = useTranslation()

  return (
    <Card className="py-0! overflow-hidden">
      <CardHeader className="border-b py-3!">
        <div className="font-semibold text-sm">{t('runs.report.languages.title')}</div>
      </CardHeader>
      <CardContent className="grid gap-3 py-3!">
        {entries.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('runs.report.languages.none')}</p>
        ) : (
          entries.map(entry => {
            const name = entry.name === '' ? t('runs.report.languages.unknown') : entry.name
            return (
              <div key={entry.name} className="grid gap-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-foreground">{name}</span>
                  <span className="text-muted-foreground">
                    {t('runs.report.languages.count', { count: entry.count })}
                  </span>
                </div>
                <Progress value={entry.pct} />
              </div>
            )
          })
        )}
        <p className="text-xs text-muted-foreground/70">
          {t('runs.report.languages.sourceNote', {
            sourceLabel: getLanguageLabel(t, sourceLanguage)
          })}
        </p>
      </CardContent>
    </Card>
  )
}
