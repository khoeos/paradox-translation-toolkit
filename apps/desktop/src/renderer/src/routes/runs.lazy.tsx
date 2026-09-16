import { createLazyRoute, Link } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import type { RunReportSummary } from '@ptt/report'
import type { ConvertMode } from '@ptt/shared'
import { Button } from '@ptt/ui/components/button'
import { Card, CardContent } from '@ptt/ui/components/card'
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious
} from '@ptt/ui/components/pagination'

import { getLanguageLabel, getModeLabel } from '@renderer/components/runs/labels'
import { RunEmptyState } from '@renderer/components/runs/RunEmptyState'
import { RunHistoryTable } from '@renderer/components/runs/RunHistoryTable'
import { RunHistoryToolbar } from '@renderer/components/runs/RunHistoryToolbar'
import { useExpandedKeys } from '@renderer/hooks/useExpandedKeys'
import type {
  RunHistoryLabels,
  RunHistoryQuery,
  RunOutcomeFilter,
  RunSortKey
} from '@renderer/lib/run-history'
import {
  buildGameFilterOptions,
  filterRuns,
  getPageCount,
  getPageSlice,
  getRunCreatedDeltas,
  sortRuns
} from '@renderer/lib/run-history'
import { trpc } from '@renderer/lib/trpc'

const MODE_VALUES: readonly ConvertMode[] = [
  'add-to-current',
  'extract-to-folder',
  'create-translation-mod'
]

function collectLanguageCodes(items: readonly RunReportSummary[]): string[] {
  const codes = new Set<string>()
  for (const item of items) {
    codes.add(item.sourceLanguage)
    for (const target of item.targetLanguages) codes.add(target)
  }
  return [...codes]
}

function findLatest(items: readonly RunReportSummary[]): RunReportSummary | undefined {
  return items.reduce<RunReportSummary | undefined>((latest, item) => {
    if (!latest || item.startedAt > latest.startedAt) return item
    return latest
  }, undefined)
}

function RunHistoryPage() {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const [now] = useState(() => new Date())

  const { data, isLoading, error } = trpc.runReports.list.useQuery()
  const { data: games } = trpc.games.list.useQuery()

  const [outcome, setOutcome] = useState<RunOutcomeFilter>('all')
  const [gameId, setGameId] = useState('all')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<RunSortKey>('date')
  const [page, setPage] = useState(1)
  const { expanded, toggle: toggleExpanded } = useExpandedKeys()

  const items = useMemo<RunReportSummary[]>(() => data?.items ?? [], [data])

  const labels: RunHistoryLabels = useMemo(() => {
    const gameLabels: Record<string, string> = {}
    for (const game of games ?? []) gameLabels[game.id] = game.displayName

    const languageLabels: Record<string, string> = {}
    for (const code of collectLanguageCodes(items)) {
      languageLabels[code] = getLanguageLabel(t, code)
    }

    const modeLabels: Record<string, string> = {}
    for (const mode of MODE_VALUES) modeLabels[mode] = getModeLabel(t, mode)

    return { games: gameLabels, languages: languageLabels, modes: modeLabels }
  }, [games, items, t])

  const query: RunHistoryQuery = useMemo(
    () => ({ outcome, gameId, search }),
    [outcome, gameId, search]
  )

  const filtered = useMemo(() => filterRuns(items, query, labels), [items, query, labels])
  const sorted = useMemo(() => sortRuns(filtered, sort), [filtered, sort])
  const pageCount = getPageCount(sorted.length)
  const currentPage = Math.min(page, pageCount)
  const pageItems = getPageSlice(sorted, currentPage)

  const deltas = useMemo(() => getRunCreatedDeltas(items), [items])
  const gameOptions = useMemo(
    () =>
      buildGameFilterOptions(items).map(option => ({
        id: option.id,
        label: labels.games[option.id] ?? option.id
      })),
    [items, labels]
  )
  const latest = useMemo(() => findLatest(items), [items])

  const openReportsFolder = trpc.fs.openPath.useMutation({
    onError: err => toast.error(t('runs.history.toast.revealError', { message: err.message }))
  })

  const listLabel =
    filtered.length === items.length
      ? t('runs.history.list.all', { count: items.length })
      : t('runs.history.list.filtered', { shown: filtered.length, total: items.length })

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-baseline justify-between gap-4 flex-wrap">
        <h2 className="text-2xl font-semibold tracking-wide">{t('runs.history.title')}</h2>
        <div className="flex items-center gap-2">
          {data?.directoryExists ? (
            <Button
              variant="outline"
              onClick={() => data && openReportsFolder.mutate({ path: data.directory })}
            >
              {t('runs.history.showFolder')}
            </Button>
          ) : null}
          {latest ? (
            <Button
              nativeButton={false}
              render={<Link to="/runs/$file" params={{ file: latest.file }} />}
            >
              {t('runs.history.openLatest')}
            </Button>
          ) : null}
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">{t('runs.history.loading')}</p>
      ) : null}
      {error ? (
        <p className="text-sm text-destructive">
          {t('runs.history.loadError', { message: error.message })}
        </p>
      ) : null}

      {data ? (
        <>
          {data.unreadable.length > 0 ? (
            <div className="text-xs text-warning">
              <p>{t('runs.history.unreadable', { count: data.unreadable.length })}</p>
              <ul className="mt-1 list-inside list-disc font-mono text-xs">
                {data.unreadable.map(file => (
                  <li key={file}>{file}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {data.truncated ? (
            <p className="text-xs text-muted-foreground">
              {t('runs.history.truncated', { count: items.length })}
            </p>
          ) : null}

          <Card className="overflow-hidden py-0!">
            <CardContent className="px-0">
              <RunHistoryToolbar
                listLabel={listLabel}
                outcome={outcome}
                onOutcomeChange={value => {
                  setOutcome(value)
                  setPage(1)
                }}
                gameId={gameId}
                onGameChange={value => {
                  setGameId(value)
                  setPage(1)
                }}
                gameOptions={gameOptions}
                search={search}
                onSearchChange={value => {
                  setSearch(value)
                  setPage(1)
                }}
              />

              {items.length === 0 ? (
                <RunEmptyState message={t('runs.history.noneYet')} />
              ) : (
                <RunHistoryTable
                  items={pageItems}
                  sort={sort}
                  onSortChange={setSort}
                  expanded={expanded}
                  onToggle={toggleExpanded}
                  deltas={deltas}
                  latestFile={latest?.file}
                  gameLabels={labels.games}
                  locale={locale}
                  now={now}
                />
              )}

              {pageCount > 1 ? (
                <div className="border-t px-4 py-3">
                  <Pagination>
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious
                          href="#"
                          text={t('runs.history.pagination.previous')}
                          aria-disabled={currentPage === 1}
                          className={currentPage === 1 ? 'pointer-events-none opacity-50' : ''}
                          onClick={event => {
                            event.preventDefault()
                            setPage(p => Math.max(1, p - 1))
                          }}
                        />
                      </PaginationItem>
                      {Array.from({ length: pageCount }, (_, index) => index + 1).map(number => (
                        <PaginationItem key={number}>
                          <PaginationLink
                            href="#"
                            isActive={number === currentPage}
                            onClick={event => {
                              event.preventDefault()
                              setPage(number)
                            }}
                          >
                            {number}
                          </PaginationLink>
                        </PaginationItem>
                      ))}
                      <PaginationItem>
                        <PaginationNext
                          href="#"
                          text={t('runs.history.pagination.next')}
                          aria-disabled={currentPage === pageCount}
                          className={
                            currentPage === pageCount ? 'pointer-events-none opacity-50' : ''
                          }
                          onClick={event => {
                            event.preventDefault()
                            setPage(p => Math.min(pageCount, p + 1))
                          }}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                  <p className="sr-only" aria-live="polite">
                    {t('runs.history.pagination.summary', { page: currentPage, count: pageCount })}
                  </p>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  )
}

export const Route = createLazyRoute('/runs')({
  component: RunHistoryPage
})
