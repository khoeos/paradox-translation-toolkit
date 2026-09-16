import { ChevronDown, ChevronUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { RunReportSummary } from '@ptt/report'
import { Badge } from '@ptt/ui/components/badge'
import { Button } from '@ptt/ui/components/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@ptt/ui/components/table'
import { cn } from '@ptt/ui/lib/utils'

import { getDayGroupLabel, getModeLabel, getOutcomeLabel } from '@renderer/components/runs/labels'
import type { Translate } from '@renderer/components/runs/labels'
import { RunEmptyState } from '@renderer/components/runs/RunEmptyState'
import { RunRowDetails } from '@renderer/components/runs/RunRowDetails'
import {
  formatDateTime,
  formatSeconds,
  formatWeekdayDate,
  getDayBucket,
  getDaysAgo
} from '@renderer/lib/format-datetime'
import type { RunDayGroup, RunSortKey } from '@renderer/lib/run-history'
import { groupRunsByDay } from '@renderer/lib/run-history'
import { getCountClasses, getOutcomeClasses } from '@renderer/lib/run-tone'

type SortableColumn = Exclude<RunSortKey, 'date'>

const SORTABLE_COLUMNS: readonly SortableColumn[] = ['created', 'failed', 'errors', 'seconds']

const COLUMN_COUNT = 8

const sortableColumnLabel = (t: Translate, key: SortableColumn): string => {
  switch (key) {
    case 'created':
      return t('runs.history.columns.created')
    case 'failed':
      return t('runs.history.columns.blocked')
    case 'errors':
      return t('runs.history.columns.messages')
    case 'seconds':
      return t('runs.history.columns.time')
  }
}

interface RunHistoryTableProps {
  items: readonly RunReportSummary[]
  sort: RunSortKey
  onSortChange: (sort: RunSortKey) => void
  expanded: ReadonlySet<string>
  onToggle: (file: string) => void
  deltas: ReadonlyMap<string, number>
  latestFile: string | undefined
  gameLabels: Record<string, string>
  locale: string
  now: Date
}

export function RunHistoryTable({
  items,
  sort,
  onSortChange,
  expanded,
  onToggle,
  deltas,
  latestFile,
  gameLabels,
  locale,
  now
}: RunHistoryTableProps) {
  const { t } = useTranslation()

  if (items.length === 0) {
    return <RunEmptyState message={t('runs.history.empty')} />
  }

  const groups: RunDayGroup[] | null = sort === 'date' ? groupRunsByDay(items) : null

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-3.5" />
          <TableHead>{t('runs.history.columns.run')}</TableHead>
          <TableHead>{t('runs.history.columns.settings')}</TableHead>
          {SORTABLE_COLUMNS.map(column => (
            <TableHead key={column} aria-sort={sort === column ? 'descending' : 'none'}>
              <button
                type="button"
                onClick={() => onSortChange(sort === column ? 'date' : column)}
                className={cn(
                  'inline-flex items-center gap-1 uppercase tracking-wider',
                  sort === column ? 'text-primary' : 'text-muted-foreground'
                )}
              >
                {sort === column ? <ChevronDown className="size-3" /> : null}
                {sortableColumnLabel(t, column)}
              </button>
            </TableHead>
          ))}
          <TableHead className="text-right">{t('runs.history.columns.report')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sort !== 'date' ? (
          <TableRow className="hover:bg-transparent">
            <TableCell
              colSpan={COLUMN_COUNT}
              className="bg-muted/40 text-[11px] text-muted-foreground"
            >
              {t('runs.history.sortedBy', { column: sortableColumnLabel(t, sort) })}
            </TableCell>
          </TableRow>
        ) : null}

        {groups
          ? groups.map(group => (
              <DayGroupRows
                key={group.key}
                group={group}
                now={now}
                locale={locale}
                expanded={expanded}
                onToggle={onToggle}
                deltas={deltas}
                latestFile={latestFile}
                gameLabels={gameLabels}
              />
            ))
          : items.map(item => (
              <RunRow
                key={item.file}
                item={item}
                locale={locale}
                expanded={expanded.has(item.file)}
                onToggle={onToggle}
                delta={deltas.get(item.file)}
                isLatest={item.file === latestFile}
                gameLabel={gameLabels[item.game] ?? item.game}
              />
            ))}
      </TableBody>
    </Table>
  )
}

interface DayGroupRowsProps {
  group: RunDayGroup
  now: Date
  locale: string
  expanded: ReadonlySet<string>
  onToggle: (file: string) => void
  deltas: ReadonlyMap<string, number>
  latestFile: string | undefined
  gameLabels: Record<string, string>
}

function DayGroupRows({
  group,
  now,
  locale,
  expanded,
  onToggle,
  deltas,
  latestFile,
  gameLabels
}: DayGroupRowsProps) {
  const { t } = useTranslation()
  const bucket = getDayBucket(group.iso, now)
  const label = getDayGroupLabel(
    t,
    bucket,
    formatWeekdayDate(group.iso, locale),
    getDaysAgo(group.iso, now)
  )

  return (
    <>
      <TableRow className="hover:bg-transparent">
        <TableCell colSpan={COLUMN_COUNT} className="bg-muted/40 text-[11px] text-muted-foreground">
          {label}
        </TableCell>
      </TableRow>
      {group.items.map(item => (
        <RunRow
          key={item.file}
          item={item}
          locale={locale}
          expanded={expanded.has(item.file)}
          onToggle={onToggle}
          delta={deltas.get(item.file)}
          isLatest={item.file === latestFile}
          gameLabel={gameLabels[item.game] ?? item.game}
        />
      ))}
    </>
  )
}

interface RunRowProps {
  item: RunReportSummary
  locale: string
  expanded: boolean
  onToggle: (file: string) => void
  delta: number | undefined
  isLatest: boolean
  gameLabel: string
}

function RunRow({ item, locale, expanded, onToggle, delta, isLatest, gameLabel }: RunRowProps) {
  const { t } = useTranslation()
  const tone = getOutcomeClasses(item.outcome)
  const modsSelectedLabel =
    item.selectedMods === 'all'
      ? t('runs.history.row.modsSelectedAll')
      : t('runs.history.row.modsSelected', { count: item.selectedMods })

  return (
    <>
      <TableRow
        aria-expanded={expanded}
        onClick={() => onToggle(item.file)}
        className={cn('cursor-pointer', isLatest ? 'bg-primary/5' : '')}
      >
        <TableCell>
          <span
            aria-hidden="true"
            className={cn('block size-2 rounded-full', tone.dot)}
            title={getOutcomeLabel(t, item.outcome)}
          />
        </TableCell>
        <TableCell className="whitespace-normal">
          <div className="flex items-center gap-2 font-semibold text-foreground">
            {formatDateTime(item.startedAt, locale)}
            {isLatest ? <Badge>{t('runs.history.badge.latest')}</Badge> : null}
            {item.cancelled ? (
              <Badge variant="secondary">{t('runs.history.badge.cancelled')}</Badge>
            ) : null}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {gameLabel} · {modsSelectedLabel}
          </div>
        </TableCell>
        <TableCell className="whitespace-normal">
          <div className="truncate text-muted-foreground">{getModeLabel(t, item.mode)}</div>
          <div className="text-[11px] text-muted-foreground/80">
            {item.sourceLanguage} → {item.targetLanguages.join(', ')}
          </div>
        </TableCell>
        <TableCell>
          {item.created}
          {delta !== undefined && delta !== 0 ? (
            <span
              className={cn(
                'ml-1 text-[11px]',
                getOutcomeClasses(delta > 0 ? 'clean' : 'failed').text
              )}
            >
              {delta > 0 ? `+${delta}` : delta}
            </span>
          ) : null}
        </TableCell>
        <TableCell className={getCountClasses(item.failed, getOutcomeClasses('failed').text)}>
          {item.failed}
        </TableCell>
        <TableCell className={getCountClasses(item.errors, getOutcomeClasses('issues').text)}>
          {item.errors}
        </TableCell>
        <TableCell>{formatSeconds(item.seconds)}</TableCell>
        <TableCell className="text-right text-muted-foreground">
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={
              expanded ? t('runs.history.row.toggleHide') : t('runs.history.row.toggleShow')
            }
            onClick={event => {
              event.stopPropagation()
              onToggle(item.file)
            }}
          >
            {expanded ? <ChevronUp /> : <ChevronDown />}
          </Button>
        </TableCell>
      </TableRow>
      {expanded ? (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={COLUMN_COUNT} className="p-0">
            <RunRowDetails item={item} gameLabel={gameLabel} locale={locale} />
          </TableCell>
        </TableRow>
      ) : null}
    </>
  )
}
