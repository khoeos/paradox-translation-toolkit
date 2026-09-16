import { Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@ptt/ui/components/button'
import { Input } from '@ptt/ui/components/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@ptt/ui/components/select'

import type { Translate } from '@renderer/components/runs/labels'
import type { RunOutcomeFilter } from '@renderer/lib/run-history'

const OUTCOME_FILTERS: readonly RunOutcomeFilter[] = ['all', 'issues', 'clean']

interface GameOption {
  id: string
  label: string
}

interface RunHistoryToolbarProps {
  listLabel: string
  outcome: RunOutcomeFilter
  onOutcomeChange: (outcome: RunOutcomeFilter) => void
  gameId: string
  onGameChange: (gameId: string) => void
  gameOptions: readonly GameOption[]
  search: string
  onSearchChange: (search: string) => void
}

const outcomeLabel = (t: Translate, outcome: RunOutcomeFilter): string => {
  switch (outcome) {
    case 'all':
      return t('runs.history.filters.all')
    case 'issues':
      return t('runs.history.filters.issues')
    case 'clean':
      return t('runs.history.filters.clean')
  }
}

export function RunHistoryToolbar({
  listLabel,
  outcome,
  onOutcomeChange,
  gameId,
  onGameChange,
  gameOptions,
  search,
  onSearchChange
}: RunHistoryToolbarProps) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
      <div className="mr-auto text-sm font-semibold">{listLabel}</div>

      <div className="flex gap-1">
        {OUTCOME_FILTERS.map(value => (
          <Button
            key={value}
            size="sm"
            variant={outcome === value ? 'default' : 'outline'}
            onClick={() => onOutcomeChange(value)}
          >
            {outcomeLabel(t, value)}
          </Button>
        ))}
      </div>

      <Select
        value={gameId}
        onValueChange={value => {
          if (typeof value === 'string') onGameChange(value)
        }}
      >
        <SelectTrigger size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('runs.history.filters.allGames')}</SelectItem>
          {gameOptions.map(option => (
            <SelectItem key={option.id} value={option.id}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={event => onSearchChange(event.target.value)}
          placeholder={t('runs.history.filters.searchPlaceholder')}
          className="w-60 pl-7"
        />
      </div>
    </div>
  )
}
