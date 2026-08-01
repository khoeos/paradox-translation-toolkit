import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ScannedMod, TranslateProvider } from '@global/types'
import { Card, CardContent } from '@renderer/components/ui/Card'
import { Button } from '@renderer/components/ui/Button'
import { Input } from '@renderer/components/ui/Input'
import { ScrollArea } from '@renderer/components/ui/ScrollArea'
import { cn } from '@renderer/lib/utils'

/**
 * Rough throughput per backend, only used to turn a line count into an order of magnitude.
 * A hosted translator is twenty times faster than a local model, so one shared constant
 * turned a 45 minute job into a quoted 15 hours and invited the wrong decision.
 * The RapidAPI figure is measured; the others are conservative.
 */
const LINES_PER_SECOND: Record<string, number> = {
  [TranslateProvider.OLLAMA]: 3,
  [TranslateProvider.OPENAI]: 3,
  [TranslateProvider.RAPIDAPI]: 60
}

/**
 * Turn a line count into a readable duration
 * @param lines - Number of lines to translate
 * @returns A short human readable estimate
 */
const formatEstimate = (lines: number, provider: string): string => {
  const seconds = Math.round(lines / (LINES_PER_SECOND[provider] ?? 3))
  if (seconds < 90) return `~${seconds} s`
  if (seconds < 5400) return `~${Math.round(seconds / 60)} min`
  return `~${(seconds / 3600).toFixed(1)} h`
}

/** Why a mod has nothing to do: three very different situations, worth telling apart */
type IdleReason = 'noLocalisation' | 'noSourceFiles' | 'upToDate'

const getIdleReason = (mod: ScannedMod): IdleReason => {
  if (mod.localisationFiles === 0) return 'noLocalisation'
  if (mod.sourceFiles === 0 || mod.sourceKeys === 0) return 'noSourceFiles'
  return 'upToDate'
}

/**
 * Coverage of a mod as a plain count per language.
 * "up to date" says nothing on its own: up to date compared to what? The numbers do.
 * @param mod - The scanned mod
 * @returns One `russian 182/182` per requested language
 */
const formatCoverage = (mod: ScannedMod): string =>
  Object.keys(mod.missingKeys)
    .map((language) => {
      const missing = mod.missingKeys[language] ?? 0
      return `${language} ${mod.sourceKeys - missing}/${mod.sourceKeys}`
    })
    .join('  ')

interface Props {
  mods: ScannedMod[]
  selected: string[]
  onSelect: (ids: string[]) => void
  onToggle: (id: string) => void
  /** Show the translation time estimate */
  withEstimate: boolean
  /** localisation or localization, whichever the selected game uses */
  translateKey: string
  /** Which backend will do the work, the estimate depends on it entirely */
  provider: string
}

export default function ModList({
  mods,
  selected,
  onSelect,
  onToggle,
  withEstimate,
  translateKey,
  provider
}: Props): JSX.Element {
  const { t } = useTranslation()
  const [filter, setFilter] = useState('')

  // Not a single mod carrying localisation almost always means the wrong game tab
  const otherSpelling = useMemo(() => mods.filter((mod) => mod.otherSpelling).length, [mods])
  const wrongGame = useMemo(
    () => mods.length > 0 && mods.every((mod) => mod.localisationFiles === 0),
    [mods]
  )

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    if (!needle) return mods
    return mods.filter(
      (mod) => mod.name.toLowerCase().includes(needle) || mod.id.toLowerCase().includes(needle)
    )
  }, [mods, filter])

  const withWork = useMemo(() => mods.filter((mod) => mod.missingFiles > 0), [mods])

  const totals = useMemo(() => {
    const chosen = mods.filter((mod) => selected.includes(mod.id))
    return {
      mods: chosen.length,
      files: chosen.reduce((sum, mod) => sum + mod.missingFiles, 0),
      lines: chosen.reduce((sum, mod) => sum + mod.missingLines, 0)
    }
  }, [mods, selected])

  // Why the greyed out mods were skipped, the single most asked question of a scan
  const idleBreakdown = useMemo(() => {
    const counts = { noLocalisation: 0, noSourceFiles: 0, upToDate: 0 }
    for (const mod of mods) {
      if (mod.missingFiles > 0) continue
      counts[getIdleReason(mod)]++
    }
    return counts
  }, [mods])

  return (
    <Card className={'col-span-12'}>
      <CardContent>
        <div className={'flex flex-wrap items-center gap-2 mt-2 mb-3'}>
          <h2 className={'text-xl font-semibold tracking-wide mr-auto'}>
            {t('ScanResult', { count: mods.length })}
          </h2>
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t('FilterMods')}
            className={'h-8 w-48'}
          />
          <Button
            className={'h-8 px-3 bg-gray-900 text-white hover:text-gray-800'}
            onClick={() => onSelect(withWork.map((mod) => mod.id))}
          >
            {t('SelectMissing')}
          </Button>
          <Button
            className={'h-8 px-3 bg-gray-900 text-white hover:text-gray-800'}
            onClick={() => onSelect([])}
          >
            {t('SelectNone')}
          </Button>
        </div>

        {wrongGame && (
          <p
            className={
              'mb-2 px-3 py-2 text-sm rounded border border-red-500/60 bg-red-950/40 text-red-200'
            }
          >
            {t(otherSpelling > 0 ? 'WrongGameSpelling' : 'WrongGameNoLocalisation', {
              expected: translateKey,
              other: translateKey === 'localization' ? 'localisation' : 'localization',
              count: otherSpelling
            })}
          </p>
        )}

        <p className={'mb-2 text-xs text-gray-300/80'}>{t('CoverageHint')}</p>

        <ScrollArea className={'h-56 border rounded border-gray-700 bg-gray-900/60'}>
          <ul className={'divide-y divide-gray-800'}>
            {visible.map((mod) => {
              const checked = selected.includes(mod.id)
              const idle = mod.missingFiles === 0
              return (
                <li
                  key={mod.id}
                  className={cn(
                    'flex items-center gap-3 px-3 py-1.5 text-sm cursor-pointer hover:bg-gray-800/60',
                    idle && 'opacity-50'
                  )}
                  onClick={() => !idle && onToggle(mod.id)}
                >
                  <input
                    type="checkbox"
                    className={'accent-amber-600 w-4 h-4 shrink-0'}
                    checked={checked}
                    disabled={idle}
                    onChange={() => onToggle(mod.id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <span
                    className={'truncate grow'}
                    title={`${mod.name}\n${mod.path}\n${t('ModCounts', {
                      localisation: mod.localisationFiles,
                      source: mod.sourceFiles,
                      keys: mod.sourceKeys
                    })}`}
                  >
                    {mod.name}
                  </span>
                  {mod.errors.length > 0 && (
                    <span className={'text-red-400 shrink-0'}>
                      {t('ErrorsCount', { count: mod.errors.length })}
                    </span>
                  )}
                  <span
                    className={cn(
                      'shrink-0 tabular-nums',
                      idle ? 'text-gray-400' : 'text-amber-500'
                    )}
                  >
                    {getIdleReason(mod) === 'upToDate'
                      ? formatCoverage(mod)
                      : t(`idle.${getIdleReason(mod)}`)}
                  </span>
                  {mod.coveredBy && mod.coveredBy.length > 0 && (
                    <span
                      className={'shrink-0 text-emerald-400/80 truncate max-w-[16rem]'}
                      title={mod.coveredBy.join(', ')}
                    >
                      ← {mod.coveredBy.join(', ')}
                    </span>
                  )}
                  {!idle && (
                    <span className={'text-gray-400 shrink-0 tabular-nums'}>
                      {t('FilesCount', { count: mod.missingFiles })}
                    </span>
                  )}
                  {withEstimate && mod.missingLines > 0 && (
                    <span className={'text-amber-500/80 shrink-0 tabular-nums w-20 text-right'}>
                      {t('LinesCount', { count: mod.missingLines })}
                    </span>
                  )}
                </li>
              )
            })}
            {visible.length === 0 && (
              <li className={'px-3 py-2 text-sm text-gray-400'}>{t('NoModsMatch')}</li>
            )}
          </ul>
        </ScrollArea>

        <p className={'mt-2 text-sm text-gray-300'}>
          {t('SelectionSummary', { mods: totals.mods, files: totals.files })}
          {withEstimate && totals.lines > 0 && (
            <span className={'text-amber-500 ml-2'}>
              {t('LinesCount', { count: totals.lines })} · {formatEstimate(totals.lines, provider)}
            </span>
          )}
        </p>
        <p className={'mt-1 text-xs text-gray-400'}>{t('IdleBreakdown', idleBreakdown)}</p>
      </CardContent>
    </Card>
  )
}
