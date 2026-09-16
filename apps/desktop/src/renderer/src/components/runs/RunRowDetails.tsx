import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import type { RunReportSummary } from '@ptt/report'
import { Badge } from '@ptt/ui/components/badge'
import { Button } from '@ptt/ui/components/button'

import { DeleteReportDialog } from '@renderer/components/runs/DeleteReportDialog'
import { getModeLabel, getTargetContentLabel } from '@renderer/components/runs/labels'
import { formatDateTime } from '@renderer/lib/format-datetime'

interface RunRowDetailsProps {
  item: RunReportSummary
  gameLabel: string
  locale: string
}

export function RunRowDetails({ item, gameLabel, locale }: RunRowDetailsProps) {
  const { t } = useTranslation()

  const written = item.translationModName ?? t('runs.history.details.noGeneratedMod')

  const rows: { label: string; value: string }[] = [
    { label: t('runs.history.details.game'), value: gameLabel },
    { label: t('runs.history.details.mode'), value: getModeLabel(t, item.mode) },
    {
      label: t('runs.history.details.written'),
      value: getTargetContentLabel(t, item.targetContent) || '-'
    },
    {
      label: t('runs.history.details.languages'),
      value: `${item.sourceLanguage} → ${item.targetLanguages.join(', ')}`
    },
    { label: t('runs.history.details.generatedMod'), value: written },
    {
      label: t('runs.history.details.modsConverted'),
      value: `${item.modsWithFiles} / ${item.mods}`
    },
    {
      label: t('runs.history.details.messages'),
      value: t('runs.history.details.readErrors', { count: item.errors })
    },
    { label: t('runs.history.details.finished'), value: formatDateTime(item.finishedAt, locale) }
  ]

  return (
    <div className="grid gap-3 bg-muted/30 px-4 py-3">
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3 lg:grid-cols-4">
        {rows.map(row => (
          <div key={row.label} className="grid gap-0.5">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {row.label}
            </div>
            <div className="truncate font-mono text-xs" title={row.value}>
              {row.value}
            </div>
          </div>
        ))}
      </div>

      {item.cancelled ? (
        <p className="text-xs text-muted-foreground">{t('runs.history.details.cancelledNote')}</p>
      ) : null}
      {!item.cancelled && item.failed > 0 ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {t('runs.history.details.failedNote', { count: item.failed })}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          nativeButton={false}
          render={<Link to="/runs/$file" params={{ file: item.file }} />}
        >
          {t('runs.history.actions.open')}
        </Button>
        <DeleteReportDialog
          file={item.file}
          trigger={
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground hover:text-destructive"
            >
              {t('runs.history.actions.delete')}
            </Button>
          }
        />
        {item.cancelled ? (
          <Badge variant="secondary">{t('runs.history.badge.cancelled')}</Badge>
        ) : null}
      </div>
    </div>
  )
}
