import { useTranslation } from 'react-i18next'

import { Card, CardContent, CardHeader } from '@ptt/ui/components/card'
import { Progress } from '@ptt/ui/components/progress'

import { getRefusalReasonLabel } from '@renderer/lib/refusal-reasons'

interface RunRefusalReasonsCardProps {
  refusalsByReason: Readonly<Record<string, number>>
  identicalCount?: number
}

export function RunRefusalReasonsCard({
  refusalsByReason,
  identicalCount
}: RunRefusalReasonsCardProps) {
  const { t } = useTranslation()

  const entries = Object.entries(refusalsByReason).filter(([, count]) => count > 0)
  const identical = identicalCount ?? 0
  const total = entries.reduce((sum, [, count]) => sum + count, 0) + identical

  return (
    <Card className="py-0! overflow-hidden">
      <CardHeader className="border-b py-3!">
        <div className="font-semibold text-sm">{t('runs.report.refusals.title')}</div>
      </CardHeader>
      <CardContent className="grid gap-3 py-3!">
        {total === 0 ? (
          <p className="text-xs text-muted-foreground">{t('runs.report.refusals.none')}</p>
        ) : (
          <>
            {entries.map(([reason, count]) => (
              <div key={reason} className="grid gap-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-foreground">{getRefusalReasonLabel(t, reason)}</span>
                  <span className="text-muted-foreground">
                    {t('runs.report.refusals.count', { count })}
                  </span>
                </div>
                <Progress value={(count / total) * 100} />
              </div>
            ))}
            {identical > 0 ? (
              <div className="grid gap-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-foreground">{getRefusalReasonLabel(t, 'identical')}</span>
                  <span className="text-muted-foreground">
                    {t('runs.report.refusals.count', { count: identical })}
                  </span>
                </div>
                <Progress value={(identical / total) * 100} />
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  )
}
