import { useTranslation } from 'react-i18next'

import { Card, CardContent, CardHeader } from '@ptt/ui/components/card'
import { cn } from '@ptt/ui/lib/utils'

import { getErrorCategoryLabels } from '@renderer/components/runs/labels'
import type { RunErrorCategory, RunErrorCategorySummary } from '@renderer/lib/run-errors'
import { getErrorCategoryClasses } from '@renderer/lib/run-tone'

interface RunErrorCategoriesProps {
  summaries: readonly RunErrorCategorySummary[]
  parsedCount: number
  totalErrors: number
  activeCategory: RunErrorCategory | null
  onToggle: (category: RunErrorCategory) => void
}

export function RunErrorCategories({
  summaries,
  parsedCount,
  totalErrors,
  activeCategory,
  onToggle
}: RunErrorCategoriesProps) {
  const { t } = useTranslation()

  const countLabel =
    parsedCount === totalErrors
      ? t('runs.report.errors.count', { count: parsedCount })
      : t('runs.report.errors.countPartial', { count: parsedCount, total: totalErrors })

  return (
    <Card className="py-0! overflow-hidden">
      <CardHeader className="flex-row items-center justify-between gap-3 border-b py-3!">
        <div className="font-semibold text-sm">{t('runs.report.errors.title')}</div>
        <div className="text-xs text-muted-foreground">{countLabel}</div>
      </CardHeader>
      <CardContent className="px-0! divide-y">
        {summaries.map(summary => {
          const tone = getErrorCategoryClasses(summary.category)
          const labels = getErrorCategoryLabels(t, summary.category)
          const isActive = activeCategory === summary.category
          return (
            <button
              key={summary.category}
              type="button"
              onClick={() => onToggle(summary.category)}
              className={cn(
                'grid w-full grid-cols-[64px_minmax(0,1fr)] items-center gap-4 px-4 py-3 text-left',
                isActive ? 'bg-accent' : 'hover:bg-muted/40'
              )}
            >
              <div className={cn('text-right text-xl font-semibold', tone.text)}>
                {summary.count}
              </div>
              <div className="grid gap-1">
                <div className="text-sm font-semibold text-foreground">
                  {labels.tag} · {labels.title}
                </div>
                <div className="text-xs text-muted-foreground">{labels.description}</div>
                {summary.languages.length > 0 ? (
                  <div className="font-mono text-xs text-muted-foreground/70">
                    {summary.languages
                      .map(
                        language =>
                          `${language.name === '' ? t('runs.report.languages.unknown') : language.name} ${language.count}`
                      )
                      .join('   ')}
                  </div>
                ) : null}
              </div>
            </button>
          )
        })}
      </CardContent>
    </Card>
  )
}
