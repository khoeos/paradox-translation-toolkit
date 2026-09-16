import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@ptt/ui/components/badge'
import { Button } from '@ptt/ui/components/button'
import { Card, CardContent, CardHeader } from '@ptt/ui/components/card'
import { Input } from '@ptt/ui/components/input'
import { cn } from '@ptt/ui/lib/utils'

import { getErrorCategoryLabels, getOutcomeLabel } from '@renderer/components/runs/labels'
import type { Translate } from '@renderer/components/runs/labels'
import { RunEmptyState } from '@renderer/components/runs/RunEmptyState'
import { useCollapseScrollAnchor } from '@renderer/hooks/useCollapseScrollAnchor'
import { useExpandedKeys } from '@renderer/hooks/useExpandedKeys'
import type {
  ModFilter,
  ParsedModError,
  ReportMod,
  RunErrorCategory
} from '@renderer/lib/run-errors'
import {
  filterReportMods,
  isFilterCompatibleWithCategory,
  parseModErrors,
  sortReportMods
} from '@renderer/lib/run-errors'
import { getCountClasses, getErrorCategoryClasses, getOutcomeClasses } from '@renderer/lib/run-tone'

const MAX_SHOWN_ERRORS = 400

const MOD_FILTERS: readonly ModFilter[] = ['all', 'issues', 'failed', 'clean']

const ROW_GRID = 'grid grid-cols-[36px_minmax(0,1fr)_128px_128px_128px_112px] items-center'
const HEADER_OFFSET = 'top-10'

const filterLabel = (t: Translate, filter: ModFilter): string => {
  switch (filter) {
    case 'all':
      return t('runs.report.mods.filters.all')
    case 'issues':
      return t('runs.report.mods.filters.issues')
    case 'failed':
      return t('runs.report.mods.filters.failed')
    case 'clean':
      return t('runs.report.mods.filters.clean')
  }
}

const matchesQuery = (error: ParsedModError, query: string): boolean => {
  if (query === '') return true
  return error.file.toLowerCase().includes(query) || error.message.toLowerCase().includes(query)
}

interface RunModsTableProps {
  mods: readonly ReportMod[]
  totalMods: number
  untranslatedCount: number
  activeCategory: RunErrorCategory | null
  onClearCategory: () => void
}

export function RunModsTable({
  mods,
  totalMods,
  untranslatedCount,
  activeCategory,
  onClearCategory
}: RunModsTableProps) {
  const { t } = useTranslation()
  const [filter, setFilter] = useState<ModFilter>('all')
  const [search, setSearch] = useState('')
  const { expanded, toggle: toggleExpanded } = useExpandedKeys()
  const scrollerRef = useRef<HTMLDivElement>(null)
  const anchorRow = useCollapseScrollAnchor(expanded, () => scrollerRef.current)

  useEffect(() => {
    if (activeCategory !== null) setFilter('issues')
  }, [activeCategory])

  const toggleMod = (id: string, row: Element | null): void => {
    if (expanded.has(id)) anchorRow(row)
    toggleExpanded(id)
  }

  const selectFilter = (value: ModFilter): void => {
    if (!isFilterCompatibleWithCategory(value, activeCategory)) onClearCategory()
    setFilter(value)
  }

  const query = search.trim().toLowerCase()
  const filtered = useMemo(
    () => sortReportMods(filterReportMods(mods, filter, activeCategory, search)),
    [mods, filter, activeCategory, search]
  )
  const detailed = mods.length
  const shown = filtered.length

  const headerLabel =
    shown === detailed
      ? t('runs.report.mods.header', { detailed, total: totalMods })
      : t('runs.report.mods.headerFiltered', { shown, detailed, total: totalMods })

  return (
    <Card className="py-0! overflow-hidden">
      <CardHeader className="flex-row flex-wrap items-center gap-3 border-b py-3!">
        <div className="mr-auto text-sm font-semibold">{headerLabel}</div>
        {activeCategory !== null ? (
          <Badge variant="outline" className="gap-1 pr-1">
            {getErrorCategoryLabels(t, activeCategory).tag}
            <button
              type="button"
              onClick={onClearCategory}
              aria-label={t('runs.report.mods.clearCategory')}
              className="rounded-full px-1 hover:bg-muted"
            >
              ✕
            </button>
          </Badge>
        ) : null}
        <div className="flex items-center gap-2">
          <Input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder={t('runs.report.mods.searchPlaceholder')}
            className="w-56"
          />
          <div className="flex gap-1">
            {MOD_FILTERS.map(value => (
              <Button
                key={value}
                size="sm"
                variant={filter === value ? 'default' : 'outline'}
                onClick={() => selectFilter(value)}
              >
                {filterLabel(t, value)}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-0! py-0!">
        {filtered.length === 0 ? (
          <RunEmptyState message={t('runs.report.mods.empty')} />
        ) : (
          <div
            ref={scrollerRef}
            role="table"
            aria-label={headerLabel}
            className="max-h-[60vh] overflow-y-auto"
          >
            <div
              role="row"
              className={cn(
                ROW_GRID,
                'sticky top-0 z-20 h-10 bg-card font-medium shadow-[inset_0_-1px_0_var(--border)]'
              )}
            >
              <div role="columnheader" />
              <div role="columnheader" className="px-2">
                {t('runs.report.mods.columns.mod')}
              </div>
              <div role="columnheader" className="px-2">
                {t('runs.report.mods.columns.created')}
              </div>
              <div role="columnheader" className="px-2">
                {t('runs.report.mods.columns.notWritten')}
              </div>
              <div role="columnheader" className="px-2">
                {t('runs.report.mods.columns.messages')}
              </div>
              <div role="columnheader" className="px-2 text-right">
                {t('runs.report.mods.columns.details')}
              </div>
            </div>
            {filtered.map(mod => {
              const isExpanded = expanded.has(mod.id)
              const outcome = mod.failed > 0 ? 'failed' : mod.errors.length > 0 ? 'issues' : 'clean'
              const tone = getOutcomeClasses(outcome)

              return (
                <div role="rowgroup" key={mod.id} className="relative">
                  <div
                    role="row"
                    aria-expanded={isExpanded}
                    onClick={event => toggleMod(mod.id, event.currentTarget)}
                    className={cn(
                      ROW_GRID,
                      'cursor-pointer border-b transition-colors',
                      isExpanded ? cn('sticky z-10 bg-muted', HEADER_OFFSET) : 'hover:bg-muted/50'
                    )}
                  >
                    <div role="cell" className="p-2">
                      <span
                        aria-hidden="true"
                        className={cn('block size-2 rounded-full', tone.dot)}
                        title={getOutcomeLabel(t, outcome)}
                      />
                    </div>
                    <div role="cell" className="p-2">
                      <div className="font-semibold break-words text-foreground">{mod.name}</div>
                      <div className="break-all font-mono text-[11px] text-muted-foreground">
                        {mod.id}
                      </div>
                    </div>
                    <div role="cell" className="p-2 text-muted-foreground">
                      {t('runs.report.mods.createdLabel', { count: mod.created })}
                    </div>
                    <div
                      role="cell"
                      className={cn(
                        'p-2',
                        getCountClasses(mod.failed, getOutcomeClasses('failed').text)
                      )}
                    >
                      {mod.failed > 0
                        ? t('runs.report.mods.notWrittenLabel', { count: mod.failed })
                        : '-'}
                    </div>
                    <div
                      role="cell"
                      className={cn(
                        'p-2',
                        getCountClasses(mod.errors.length, getOutcomeClasses('issues').text)
                      )}
                    >
                      {mod.errors.length > 0
                        ? t('runs.report.mods.messagesLabel', { count: mod.errors.length })
                        : t('runs.report.mods.noMessage')}
                    </div>
                    <div role="cell" className="p-2 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={event => {
                          event.stopPropagation()
                          toggleMod(mod.id, event.currentTarget.closest('[role="row"]'))
                        }}
                      >
                        {isExpanded ? t('runs.report.mods.hide') : t('runs.report.mods.details')}
                      </Button>
                    </div>
                  </div>
                  {isExpanded ? (
                    <ModErrorsRow mod={mod} activeCategory={activeCategory} query={query} />
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
      {untranslatedCount > 0 ? (
        <div className="border-t px-4 py-3 text-xs text-muted-foreground">
          {t('runs.report.untranslatedNote', { count: untranslatedCount })}
        </div>
      ) : null}
    </Card>
  )
}

interface ModErrorsRowProps {
  mod: ReportMod
  activeCategory: RunErrorCategory | null
  query: string
}

function ModErrorsRow({ mod, activeCategory, query }: ModErrorsRowProps) {
  const { t } = useTranslation()
  const parsedErrors = parseModErrors(mod.errors).filter(
    error =>
      (activeCategory === null || error.category === activeCategory) && matchesQuery(error, query)
  )
  const shownErrors = parsedErrors.slice(0, MAX_SHOWN_ERRORS)
  const overflow = parsedErrors.length - shownErrors.length

  return (
    <div role="row" className="border-b bg-muted/30">
      <div role="cell">
        <div className="px-4 py-2">
          {shownErrors.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">
              {t('runs.report.mods.noMatchingErrors')}
            </p>
          ) : (
            <div className="grid gap-2 py-2">
              {shownErrors.map((error, index) => (
                <div
                  key={`${mod.id}-${index}`}
                  className="grid grid-cols-[150px_minmax(0,1fr)] gap-4 border-b pb-2 last:border-b-0"
                >
                  <Badge
                    variant="outline"
                    className={cn('w-fit uppercase', getErrorCategoryClasses(error.category).text)}
                  >
                    {getErrorCategoryLabels(t, error.category).tag}
                  </Badge>
                  <div className="grid gap-0.5">
                    <div
                      className="break-all font-mono text-xs text-foreground"
                      title={error.location}
                    >
                      {error.file}
                    </div>
                    <div className="text-xs break-words text-muted-foreground">
                      {error.category === 'blocked' &&
                      error.sourceFile !== undefined &&
                      error.detail !== undefined
                        ? t('runs.report.errors.blockedMessage', {
                            file: error.sourceFile,
                            detail: error.detail
                          })
                        : error.message}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {overflow > 0 ? (
            <p className="pb-2 text-xs text-muted-foreground">
              {t('runs.report.mods.andMore', { count: overflow })}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
