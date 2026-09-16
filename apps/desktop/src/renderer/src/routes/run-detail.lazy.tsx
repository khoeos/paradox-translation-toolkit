import { createLazyRoute, Link, useNavigate, useParams } from '@tanstack/react-router'
import { ChevronLeft } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@ptt/ui/components/button'

import { DeleteReportDialog } from '@renderer/components/runs/DeleteReportDialog'
import { KpiTile } from '@renderer/components/runs/KpiTile'
import {
  getLanguageLabel,
  getModeLabel,
  getTargetContentLabel
} from '@renderer/components/runs/labels'
import { RunErrorCategories } from '@renderer/components/runs/RunErrorCategories'
import { RunLanguageErrorsCard } from '@renderer/components/runs/RunLanguageErrorsCard'
import { RunModsTable } from '@renderer/components/runs/RunModsTable'
import { RunSettingsCard } from '@renderer/components/runs/RunSettingsCard'
import { formatDateTime, formatSeconds, formatTime } from '@renderer/lib/format-datetime'
import type { RunErrorCategory } from '@renderer/lib/run-errors'
import { getErrorCategorySummaries, getReadErrorsByLanguageFolder } from '@renderer/lib/run-errors'
import { getOutcomeClasses } from '@renderer/lib/run-tone'
import { trpc } from '@renderer/lib/trpc'

function RunReportPage() {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const navigate = useNavigate()
  const { file } = useParams({ from: '/runs/$file' })

  const [activeCategory, setActiveCategory] = useState<RunErrorCategory | null>(null)

  const { data, isLoading, error } = trpc.runReports.get.useQuery({ file })
  const { data: games } = trpc.games.list.useQuery()
  const utils = trpc.useUtils()

  const showItemInFolder = trpc.fs.showItemInFolder.useMutation({
    onError: err => toast.error(t('runs.report.toast.revealError', { message: err.message }))
  })

  const toggleCategory = (category: RunErrorCategory): void => {
    setActiveCategory(previous => (previous === category ? null : category))
  }

  const mods = data?.report.mods
  const categorySummaries = useMemo(() => (mods ? getErrorCategorySummaries(mods) : []), [mods])
  const languageErrors = useMemo(() => (mods ? getReadErrorsByLanguageFolder(mods) : []), [mods])

  const gameId = data?.report.request.game
  const gameLabel = games?.find(game => game.id === gameId)?.displayName ?? gameId ?? ''

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-baseline justify-between gap-4 flex-wrap">
        <div className="flex items-baseline gap-3">
          <Link
            to="/runs"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="size-4" />
            {t('runs.report.back')}
          </Link>
          <h2 className="text-2xl font-semibold tracking-wide">{t('runs.report.title')}</h2>
          {data ? (
            <span className="text-sm text-muted-foreground">
              {[
                gameLabel,
                getModeLabel(t, data.report.request.mode),
                getTargetContentLabel(t, data.report.request.targetContent),
                formatDateTime(data.report.startedAt, locale),
                formatSeconds(data.report.seconds)
              ]
                .filter(part => part !== '')
                .join(' · ')}
            </span>
          ) : null}
        </div>
        {data ? (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => showItemInFolder.mutate({ path: data.jsonPath })}
            >
              {t('runs.report.actions.revealJson')}
            </Button>
            {data.csvExists ? (
              <Button
                variant="outline"
                onClick={() => showItemInFolder.mutate({ path: data.csvPath })}
              >
                {t('runs.report.actions.revealCsv')}
              </Button>
            ) : null}
            <DeleteReportDialog
              file={data.file}
              onDeleted={() => {
                utils.runReports.get.reset({ file })
                navigate({ to: '/runs' })
              }}
              trigger={
                <Button variant="ghost" className="text-muted-foreground hover:text-destructive">
                  {t('runs.report.actions.delete')}
                </Button>
              }
            />
          </div>
        ) : null}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">{t('runs.report.loading')}</p>
      ) : null}
      {error ? (
        <p className="text-sm text-destructive">
          {t('runs.report.loadError', { message: error.message })}
        </p>
      ) : null}

      {data ? (
        <>
          {data.report.cancelled === true ? (
            <p className="text-xs text-muted-foreground">{t('runs.report.cancelledNote')}</p>
          ) : null}

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <KpiTile
              label={t('runs.report.kpi.created.label')}
              value={String(data.report.totals.created)}
              sub={data.report.request.targetLanguages
                .map(code => getLanguageLabel(t, code))
                .join(' + ')}
            />
            <KpiTile
              label={t('runs.report.kpi.notWritten.label')}
              value={String(data.report.totals.failed)}
              valueClassName={
                getOutcomeClasses(data.report.totals.failed > 0 ? 'failed' : 'clean').text
              }
              sub={
                data.report.totals.failed > 0
                  ? t('runs.report.kpi.notWritten.subBlocked', { count: data.report.totals.failed })
                  : t('runs.report.kpi.notWritten.subNone')
              }
            />
            <KpiTile
              label={t('runs.report.kpi.messages.label')}
              value={String(data.report.totals.errors)}
              valueClassName="text-warning"
              sub={t('runs.report.kpi.messages.sub')}
            />
            <KpiTile
              label={t('runs.report.kpi.modsConverted.label')}
              value={`${data.report.totals.modsWithFiles} / ${data.report.totals.mods}`}
              sub={t('runs.report.kpi.modsConverted.sub', {
                count: data.report.totals.mods - data.report.totals.modsWithFiles
              })}
            />
            <KpiTile
              label={t('runs.report.kpi.duration.label')}
              value={formatSeconds(data.report.seconds)}
              sub={t('runs.report.kpi.duration.sub', {
                time: formatTime(data.report.finishedAt, locale)
              })}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.15fr_1fr] items-start">
            <RunErrorCategories
              summaries={categorySummaries}
              parsedCount={data.report.mods.reduce((sum, mod) => sum + mod.errors.length, 0)}
              totalErrors={data.report.totals.errors}
              activeCategory={activeCategory}
              onToggle={toggleCategory}
            />
            <RunSettingsCard report={data.report} gameLabel={gameLabel} />
          </div>

          <RunModsTable
            mods={data.report.mods}
            totalMods={data.report.totals.mods}
            untranslatedCount={data.untranslatedCount}
            activeCategory={activeCategory}
            onClearCategory={() => setActiveCategory(null)}
          />

          <RunLanguageErrorsCard
            entries={languageErrors}
            sourceLanguage={data.report.request.sourceLanguage}
          />
        </>
      ) : null}
    </div>
  )
}

export const Route = createLazyRoute('/runs/$file')({
  component: RunReportPage
})
