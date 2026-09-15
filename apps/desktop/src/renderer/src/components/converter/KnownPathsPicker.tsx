import { isTRPCClientError } from '@trpc/client'
import {
  ChevronDown,
  ChevronUp,
  ClipboardPaste,
  FolderIcon,
  LoaderCircle,
  Search
} from 'lucide-react'
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@ptt/ui/components/button'
import { Input } from '@ptt/ui/components/input'
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@ptt/ui/components/popover'
import { ScrollArea } from '@ptt/ui/components/scroll-area'
import { ToggleGroup, ToggleGroupItem } from '@ptt/ui/components/toggle-group'
import { cn } from '@ptt/ui/lib/utils'

import { KnownPathGroup } from '@renderer/components/converter/KnownPathGroup'
import { KnownPathRow } from '@renderer/components/converter/KnownPathRow'
import { useDetectedPaths } from '@renderer/hooks/useDetectedPaths'
import {
  toPathDisplay,
  type DetectedPathKind,
  type DetectedPathSuggestion
} from '@renderer/lib/detected-paths'
import {
  filterByGame,
  groupByPinned,
  resolveClickedPath,
  type ClickedPathResult,
  type KnownPathEntry,
  type KnownPathKind,
  type PathValidationStatus
} from '@renderer/lib/known-paths'
import { isPastedPathLike } from '@renderer/lib/pasted-path'
import { canonicalPathKey, buildPathGroups } from '@renderer/lib/path-groups'
import {
  countPathGroupRows,
  getNextRowIndex,
  getPreviousRowIndex
} from '@renderer/lib/path-navigation'
import {
  filterPathGroups,
  PATH_CATEGORY_FILTERS,
  type PathCategoryFilter
} from '@renderer/lib/path-search'
import { trpc } from '@renderer/lib/trpc'

interface KnownPathsPickerProps {
  id?: string
  gameId: string
  kind: KnownPathKind
  value: string
  onChange: (path: string) => void
  className?: string
}

type FlatRow =
  | { kind: 'known'; entry: KnownPathEntry }
  | { kind: 'detected'; suggestion: DetectedPathSuggestion }

const EXPECTED_ADD_KNOWN_PATH_ERROR_CODES = ['FORBIDDEN', 'BAD_REQUEST']
const EMPTY_SUBTITLE = '-'

export function KnownPathsPicker({
  id,
  gameId,
  kind,
  value,
  onChange,
  className
}: KnownPathsPickerProps) {
  const { t } = useTranslation()
  const utils = trpc.useUtils()
  const { data: settings } = trpc.settings.getAll.useQuery()
  const { data: platform } = trpc.app.platform.useQuery()
  const detected = useDetectedPaths(gameId, kind)

  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState<PathCategoryFilter>('all')
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const [invalidStatus, setInvalidStatus] = useState<PathValidationStatus | null>(null)

  const searchInputRef = useRef<HTMLInputElement>(null)
  const pinnedTitleId = useId()
  const detectedTitleId = useId()
  const recentTitleId = useId()
  const listboxId = useId()

  useEffect(() => {
    setInvalidStatus(null)
    setActiveIndex(null)
  }, [gameId])

  useEffect(() => {
    setActiveIndex(null)
  }, [query, filter])

  const pickFolder = trpc.fs.pickFolder.useMutation()
  const addKnownPath = trpc.settings.addKnownPath.useMutation({
    onSuccess: () => utils.settings.getAll.invalidate()
  })
  const togglePin = trpc.settings.togglePinKnownPath.useMutation({
    onSuccess: () => utils.settings.getAll.invalidate()
  })
  const clearHistory = trpc.settings.clearKnownPaths.useMutation({
    onSuccess: () => utils.settings.getAll.invalidate()
  })

  const caseSensitive = platform === 'linux'
  const entries = filterByGame(settings?.knownPaths ?? [], gameId, kind)
  const { recent: storedRecent } = groupByPinned(entries)
  const groups = buildPathGroups(entries, detected.suggestions, caseSensitive)
  const pinnedFilterDisabled = groups.pinned.length === 0
  const effectiveFilter: PathCategoryFilter =
    filter === 'pinned' && pinnedFilterDisabled ? 'all' : filter
  const filteredGroups = filterPathGroups(groups, effectiveFilter, query)

  const showUsePathRow = isPastedPathLike(query)
  const trimmedQuery = query.trim()
  const rowCount = countPathGroupRows(filteredGroups)
  const isGlobalEmpty = trimmedQuery.length > 0 && !showUsePathRow && rowCount === 0

  const flatRows: FlatRow[] = [
    ...filteredGroups.pinned.map(entry => ({ kind: 'known' as const, entry })),
    ...filteredGroups.detected.map(suggestion => ({ kind: 'detected' as const, suggestion })),
    ...filteredGroups.recent.map(entry => ({ kind: 'known' as const, entry }))
  ]

  const pinnedVisible =
    (effectiveFilter === 'all' || effectiveFilter === 'pinned') && groups.pinned.length > 0
  const detectedVisible = effectiveFilter === 'all' || effectiveFilter === 'detected'
  const recentVisible = effectiveFilter === 'all' || effectiveFilter === 'recent'

  const optionId = (rowIndex: number): string => `${listboxId}-option-${rowIndex}`

  const isSelectedPath = (path: string): boolean =>
    value !== '' && canonicalPathKey(path, caseSensitive) === canonicalPathKey(value, caseSensitive)

  const isKnownPath = (path: string): boolean =>
    entries.some(
      entry => canonicalPathKey(entry.path, caseSensitive) === canonicalPathKey(path, caseSensitive)
    )

  const handleOpenChange = (nextOpen: boolean): void => {
    if (nextOpen) {
      setFilter('all')
      setActiveIndex(null)
      setOpen(true)
      return
    }
    setOpen(false)
    setQuery('')
    setActiveIndex(null)
  }

  const validate = (path: string): Promise<PathValidationStatus> =>
    utils.fs.validatePath.fetch({ path })

  const isExpectedAddKnownPathError = (error: unknown): boolean =>
    isTRPCClientError(error) &&
    EXPECTED_ADD_KNOWN_PATH_ERROR_CODES.some(code => code === error.data?.code)

  const runIgnoringExpectedAddKnownPathErrors = async (
    operation: () => Promise<void>
  ): Promise<void> => {
    try {
      await operation()
    } catch (error) {
      if (isExpectedAddKnownPathError(error)) return
      console.error('[KnownPathsPicker] failed to persist known path:', error)
    }
  }

  const persistKnownPathQuietly = (path: string): Promise<void> =>
    runIgnoringExpectedAddKnownPathErrors(async () => {
      await addKnownPath.mutateAsync({ path, gameId, kind })
    })

  const handleResolved = async (result: ClickedPathResult, persist: boolean): Promise<void> => {
    if (result.status !== 'ok') {
      setInvalidStatus(result.status)
      return
    }
    setInvalidStatus(null)
    if (persist) await persistKnownPathQuietly(result.path)
    onChange(result.path)
    handleOpenChange(false)
  }

  const handleSelectKnown = (entry: KnownPathEntry): void => {
    void resolveClickedPath(entry, validate).then(result => handleResolved(result, true))
  }

  const handleSelectDetected = (suggestion: DetectedPathSuggestion): void => {
    const entry: KnownPathEntry = {
      path: suggestion.path,
      gameId,
      kind,
      lastUsedAt: new Date().toISOString(),
      pinned: false
    }
    void resolveClickedPath(entry, validate).then(result => handleResolved(result, false))
  }

  const handleUsePastedPath = (path: string): void => {
    const entry: KnownPathEntry = {
      path,
      gameId,
      kind,
      lastUsedAt: new Date().toISOString(),
      pinned: false
    }
    void resolveClickedPath(entry, validate).then(result => handleResolved(result, true))
  }

  const handleTogglePinKnown = (entry: KnownPathEntry): void => {
    togglePin.mutate({ path: entry.path, gameId: entry.gameId, kind: entry.kind })
  }

  const handleTogglePinDetected = async (suggestion: DetectedPathSuggestion): Promise<void> => {
    if (isKnownPath(suggestion.path)) {
      togglePin.mutate({ path: suggestion.path, gameId, kind })
      return
    }
    await runIgnoringExpectedAddKnownPathErrors(async () => {
      await addKnownPath.mutateAsync({ path: suggestion.path, gameId, kind, pinned: true })
    })
  }

  const handlePick = async (): Promise<void> => {
    const result = await pickFolder.mutateAsync(value ? { defaultPath: value } : undefined)
    if (!result) return
    setInvalidStatus(null)
    await persistKnownPathQuietly(result)
    onChange(result)
    handleOpenChange(false)
  }

  const handlePasteFromClipboard = async (): Promise<void> => {
    const text = await utils.fs.readClipboardText.fetch()
    if (text === null) return
    setQuery(text)
    searchInputRef.current?.focus()
  }

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex(getNextRowIndex(filteredGroups, activeIndex))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex(getPreviousRowIndex(filteredGroups, activeIndex))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      if (activeIndex !== null) {
        const row = flatRows[activeIndex]
        if (row === undefined) return
        if (row.kind === 'known') handleSelectKnown(row.entry)
        else handleSelectDetected(row.suggestion)
      } else if (showUsePathRow) {
        handleUsePastedPath(trimmedQuery)
      }
    } else if (event.key === 'Escape') {
      handleOpenChange(false)
    }
  }

  const handleFilterChange = (nextFilter: string[]): void => {
    const [selected] = nextFilter
    const match = PATH_CATEGORY_FILTERS.find(candidate => candidate === selected)
    if (match !== undefined) setFilter(match)
  }

  const filterLabel = (filterValue: PathCategoryFilter): string => {
    switch (filterValue) {
      case 'all':
        return t('folderPicker.filterAll')
      case 'pinned':
        return t('folderPicker.filterPinned')
      case 'detected':
        return t('folderPicker.filterDetected')
      case 'recent':
        return t('folderPicker.filterRecent')
    }
  }

  const detectedKindLabel = (detectedKind: DetectedPathKind): string => {
    switch (detectedKind) {
      case 'workshopContent':
        return t('folderPicker.detectedWorkshopContent')
      case 'userModsFolder':
        return t('folderPicker.detectedUserModsFolder')
      case 'installDir':
        return t('folderPicker.detectedInstallDir')
      case 'gogInstall':
        return t('folderPicker.detectedGogInstall')
    }
  }

  const triggerDisplay =
    value === ''
      ? { title: t('folderPicker.emptyTitle'), subtitle: EMPTY_SUBTITLE }
      : toPathDisplay(value)

  const pinnedIndex = 0
  const detectedIndex = filteredGroups.pinned.length
  const recentIndex = detectedIndex + filteredGroups.detected.length

  const detectedStatus = detected.isLoading ? (
    <div
      role="status"
      className="flex items-center gap-2 px-3.5 py-2.5 text-xs text-muted-foreground"
    >
      <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" />
      {t('folderPicker.detectedLoading')}
    </div>
  ) : detected.isError ? (
    <p role="alert" className="px-3.5 py-2.5 text-xs text-destructive">
      {t('folderPicker.detectedError')}
    </p>
  ) : undefined

  const detectedEmptyMessage = (
    <div className="space-y-1 px-3.5 py-2.5 text-[11.5px] leading-relaxed text-muted-foreground">
      <p>{t('folderPicker.detectedEmpty')}</p>
      {detected.steamLibraries.length > 0 ? (
        <div className="space-y-1">
          <p>{t('folderPicker.detectedSearchedIn')}</p>
          <ul className="space-y-0.5">
            {detected.steamLibraries.map(library => (
              <li key={library} className="truncate font-mono">
                {library}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p>{t('folderPicker.detectedNoLibraries')}</p>
      )}
    </div>
  )

  const recentEmptyMessage = (
    <p className="px-3.5 py-2.5 text-[11.5px] leading-relaxed text-muted-foreground">
      {t('folderPicker.recentEmpty')}
    </p>
  )

  return (
    <div className="grid gap-1.5">
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger
          id={id}
          title={value !== '' ? value : undefined}
          className={cn(
            'flex w-full min-w-0 items-center gap-2.5 rounded-lg border border-border bg-input/20 px-3 py-2.5 text-left transition-colors duration-[120ms] ease-out outline-none hover:border-primary/55 focus-visible:ring-2 focus-visible:ring-ring/30 aria-expanded:border-primary/55',
            className
          )}
        >
          <FolderIcon aria-hidden="true" className="size-4 shrink-0 text-primary" />
          <span className="grid min-w-0 flex-1 gap-0.5">
            <span className="truncate text-xs font-semibold text-foreground">
              {triggerDisplay.title}
            </span>
            <span className="truncate font-mono text-[11px] text-muted-foreground">
              {triggerDisplay.subtitle}
            </span>
          </span>
          {open ? (
            <ChevronUp aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronDown aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
          )}
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={6}
          className="bg-popover/70! w-(--anchor-width) min-w-[360px] flex-col gap-0 rounded-[10px] border p-0 shadow-2xl backdrop-blur-sm"
        >
          <PopoverTitle className="sr-only">{t('folderPicker.popoverTitle')}</PopoverTitle>

          <div className="grid grid-cols-2 gap-2 p-2.5">
            <button
              type="button"
              onClick={() => void handlePick()}
              className="flex items-center gap-2.5 rounded-lg border border-primary/35 bg-primary/8 px-2.5 py-2.5 text-left transition-colors duration-[120ms] ease-out outline-none hover:bg-primary/16 focus-visible:ring-2 focus-visible:ring-ring/30"
            >
              <span className="flex size-[30px] shrink-0 items-center justify-center rounded-[7px] bg-primary/16">
                <FolderIcon aria-hidden="true" className="size-4 text-primary" />
              </span>
              <span className="grid gap-0.5">
                <span className="text-xs font-semibold text-foreground">
                  {t('folderPicker.browseTitle')}
                </span>
                <span className="text-[10.5px] text-muted-foreground">
                  {t('folderPicker.browseSubtitle')}
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => void handlePasteFromClipboard()}
              className="flex items-center gap-2.5 rounded-lg border border-border bg-muted/30 px-2.5 py-2.5 text-left transition-colors duration-[120ms] ease-out outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/30"
            >
              <span className="flex size-[30px] shrink-0 items-center justify-center rounded-[7px] bg-muted">
                <ClipboardPaste aria-hidden="true" className="size-4 text-foreground/80" />
              </span>
              <span className="grid gap-0.5">
                <span className="text-xs font-semibold text-foreground">
                  {t('folderPicker.pasteTitle')}
                </span>
                <span className="text-[10.5px] text-muted-foreground">
                  {t('folderPicker.pasteSubtitle')}
                </span>
              </span>
            </button>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 pb-2.5">
            <ToggleGroup
              value={[effectiveFilter]}
              onValueChange={handleFilterChange}
              aria-label={t('folderPicker.filterGroupLabel')}
            >
              {PATH_CATEGORY_FILTERS.map(filterValue => (
                <ToggleGroupItem
                  key={filterValue}
                  value={filterValue}
                  size="sm"
                  disabled={filterValue === 'pinned' && pinnedFilterDisabled}
                  className="data-[pressed]:border-primary/45 data-[pressed]:bg-primary/14 data-[pressed]:text-primary"
                >
                  {filterLabel(filterValue)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <div className="relative ml-auto w-[172px] shrink-0">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                ref={searchInputRef}
                value={query}
                onChange={event => setQuery(event.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder={t('folderPicker.searchPlaceholder')}
                aria-label={t('folderPicker.searchPlaceholder')}
                role="combobox"
                aria-haspopup="listbox"
                aria-autocomplete="list"
                aria-expanded={open}
                aria-controls={listboxId}
                aria-activedescendant={activeIndex !== null ? optionId(activeIndex) : undefined}
                className="h-7 pl-7 text-[11.5px]"
              />
            </div>
          </div>

          {invalidStatus !== null ? (
            <p role="alert" className="px-2.5 pb-2.5 text-[11.5px] text-destructive">
              {t(
                invalidStatus === 'critical'
                  ? 'folderPicker.invalidCritical'
                  : 'folderPicker.invalidNotFound'
              )}
            </p>
          ) : null}

          <div role="status" className="sr-only">
            {showUsePathRow ? t('folderPicker.usePathAvailable') : ''}
          </div>

          <ScrollArea className="max-h-[330px] border-t">
            {showUsePathRow ? (
              <button
                type="button"
                onClick={() => handleUsePastedPath(trimmedQuery)}
                className="m-2.5 flex min-w-0 items-center gap-2.5 rounded-lg border border-dashed border-primary/50 bg-primary/7 px-2.5 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
              >
                <span className="shrink-0 text-xs font-semibold text-primary">
                  {t('folderPicker.usePath')}
                </span>
                <span className="min-w-0 truncate font-mono text-[11px] text-muted-foreground">
                  {query}
                </span>
              </button>
            ) : null}

            <div role="listbox" id={listboxId}>
              {isGlobalEmpty ? null : (
                <>
                  <KnownPathGroup
                    titleId={pinnedTitleId}
                    label={t('folderPicker.pinned')}
                    count={filteredGroups.pinned.length}
                    visible={pinnedVisible}
                    isEmpty={false}
                  >
                    {filteredGroups.pinned.map((entry, localIndex) => {
                      const { title, subtitle } = toPathDisplay(entry.path)
                      const rowIndex = pinnedIndex + localIndex
                      return (
                        <KnownPathRow
                          key={entry.path}
                          id={optionId(rowIndex)}
                          fullPath={entry.path}
                          title={title}
                          subtitle={subtitle}
                          pinned={entry.pinned}
                          selected={isSelectedPath(entry.path)}
                          active={activeIndex === rowIndex}
                          onSelect={() => handleSelectKnown(entry)}
                          onTogglePin={() => handleTogglePinKnown(entry)}
                        />
                      )
                    })}
                  </KnownPathGroup>

                  <KnownPathGroup
                    titleId={detectedTitleId}
                    label={t('folderPicker.detected')}
                    count={filteredGroups.detected.length}
                    visible={detectedVisible}
                    isEmpty={groups.detected.length === 0}
                    status={detectedStatus}
                    emptyMessage={detectedEmptyMessage}
                  >
                    {filteredGroups.detected.map((suggestion, localIndex) => {
                      const { title, subtitle } = toPathDisplay(suggestion.path)
                      const rowIndex = detectedIndex + localIndex
                      return (
                        <KnownPathRow
                          key={`${suggestion.kind}:${suggestion.path}`}
                          id={optionId(rowIndex)}
                          fullPath={suggestion.path}
                          title={title}
                          subtitle={subtitle}
                          meta={detectedKindLabel(suggestion.kind)}
                          pinned={false}
                          selected={isSelectedPath(suggestion.path)}
                          active={activeIndex === rowIndex}
                          onSelect={() => handleSelectDetected(suggestion)}
                          onTogglePin={() => void handleTogglePinDetected(suggestion)}
                        />
                      )
                    })}
                  </KnownPathGroup>

                  <KnownPathGroup
                    titleId={recentTitleId}
                    label={t('folderPicker.recentGroupLabel')}
                    count={filteredGroups.recent.length}
                    visible={recentVisible}
                    isEmpty={groups.recent.length === 0}
                    emptyMessage={recentEmptyMessage}
                  >
                    {filteredGroups.recent.map((entry, localIndex) => {
                      const { title, subtitle } = toPathDisplay(entry.path)
                      const rowIndex = recentIndex + localIndex
                      return (
                        <KnownPathRow
                          key={entry.path}
                          id={optionId(rowIndex)}
                          fullPath={entry.path}
                          title={title}
                          subtitle={subtitle}
                          pinned={entry.pinned}
                          selected={isSelectedPath(entry.path)}
                          active={activeIndex === rowIndex}
                          onSelect={() => handleSelectKnown(entry)}
                          onTogglePin={() => handleTogglePinKnown(entry)}
                        />
                      )
                    })}
                  </KnownPathGroup>
                </>
              )}
            </div>

            {isGlobalEmpty ? (
              <div className="grid justify-items-center gap-2 px-3 py-6 text-center">
                <p className="text-[12.5px] text-muted-foreground">
                  {t('folderPicker.emptyResults')}
                </p>
                <button
                  type="button"
                  onClick={() => void handlePick()}
                  className="rounded-md border border-primary/35 bg-primary/10 px-3.5 py-1.5 text-xs font-semibold text-primary transition-colors duration-[120ms] ease-out outline-none hover:bg-primary/16 focus-visible:ring-2 focus-visible:ring-ring/30"
                >
                  {t('folderPicker.browseTitle')}
                </button>
              </div>
            ) : null}
          </ScrollArea>

          <div className="flex items-center gap-2 border-t bg-muted px-3 py-0">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ml-auto h-6 px-2 text-[10.5px] font-semibold tracking-[0.09em] text-muted-foreground uppercase hover:bg-transparent hover:text-foreground"
              disabled={storedRecent.length === 0}
              onClick={() => clearHistory.mutate({ gameId, kind })}
            >
              {t('folderPicker.clearHistory')}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
