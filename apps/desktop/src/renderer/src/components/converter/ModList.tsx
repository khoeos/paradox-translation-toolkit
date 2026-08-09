import { memo } from 'react'
import { useTranslation } from 'react-i18next'

import type { ScannedMod } from '@ptt/converter'
// The zod-free subexport, like `@ptt/converter/progress`: a value import of the package
// root would pull zod and the whole pipeline into the renderer bundle.
import { sumByLanguage } from '@ptt/converter/totals'
import { Badge } from '@ptt/ui/components/badge'
import { Button } from '@ptt/ui/components/button'
import { Checkbox } from '@ptt/ui/components/checkbox'
import { ScrollArea } from '@ptt/ui/components/scroll-area'
import { cn } from '@ptt/ui/lib/utils'

import { useConverterFormStore } from '@renderer/store/converter-form'

/**
 * The mods a scan found, and what each is missing.
 *
 * Ported from PR #4 (e21ee7a, `LanguageConverter/ModList.tsx`) by Artem Kondrashev. It replaced a
 * single Convert button, which matters because a local translation runs at a few lines per second:
 * the user has to be able to pick what is worth the wait.
 */
export function ModList() {
  const { t } = useTranslation()
  const mods = useConverterFormStore(s => s.scannedMods)
  const selected = useConverterFormStore(s => s.selectedMods)
  const toggleMod = useConverterFormStore(s => s.toggleMod)
  const setSelectedMods = useConverterFormStore(s => s.setSelectedMods)

  if (mods.length === 0) return null

  const withWork = mods.filter(mod => mod.missingFiles > 0)

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold tracking-wider">
          {t('converter.modList.title', { count: mods.length })}
        </span>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setSelectedMods(withWork.map(mod => mod.id))}
          >
            {t('converter.modList.selectMissing')}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedMods([])}>
            {t('converter.modList.selectNone')}
          </Button>
        </div>
      </div>

      <ScrollArea className="h-64 rounded-md border">
        <ul className="divide-y">
          {/* `toggleMod` is passed straight through rather than wrapped in a per-row closure:
              a new function per render would defeat the `memo` on `ModRow` and re-render every
              row of a several-hundred-mod collection on each checkbox click. */}
          {mods.map(mod => (
            <ModRow key={mod.id} mod={mod} checked={selected.has(mod.id)} onToggle={toggleMod} />
          ))}
        </ul>
      </ScrollArea>
    </div>
  )
}

interface ModRowProps {
  mod: ScannedMod
  checked: boolean
  onToggle: (id: string) => void
}

const ModRow = memo(function ModRow({ mod, checked, onToggle }: ModRowProps) {
  const { t } = useTranslation()
  const missingKeys = sumByLanguage(mod.missingKeys)
  const coveredKeys = sumByLanguage(mod.coveredKeys)
  const englishKeys = sumByLanguage(mod.englishKeys)
  const nothingToDo = mod.missingFiles === 0

  return (
    <li className={cn('flex items-start gap-3 p-3', nothingToDo && 'opacity-60')}>
      <Checkbox
        checked={checked}
        onCheckedChange={() => onToggle(mod.id)}
        aria-label={t('converter.modList.toggle', { name: mod.name })}
        className="mt-1"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{mod.name}</span>
          {mod.otherSpelling ? (
            <Badge variant="destructive">{t('converter.modList.otherSpelling')}</Badge>
          ) : null}
          {mod.localisationFiles === 0 ? (
            <Badge variant="outline">{t('converter.modList.noLocalisation')}</Badge>
          ) : null}
        </div>

        <p className="text-xs text-muted-foreground">
          {nothingToDo
            ? t('converter.modList.nothingMissing')
            : t('converter.modList.missing', { files: mod.missingFiles, keys: missingKeys })}
        </p>

        {(mod.coveredBy ?? []).length > 0 ? (
          <p className="text-xs text-muted-foreground">
            {t('converter.modList.coveredBy', { names: mod.coveredBy.join(', ') })}
          </p>
        ) : null}

        {englishKeys > 0 ? (
          <p className="text-xs text-amber-600 dark:text-amber-500">
            {t('converter.modList.englishKeys', { count: englishKeys })}
          </p>
        ) : null}

        {mod.errors.length > 0 ? (
          <p className="text-xs text-destructive">
            {t('converter.modList.errors', { count: mod.errors.length })}
          </p>
        ) : null}
      </div>

      <div className="shrink-0 text-right text-xs text-muted-foreground">
        <div>{t('converter.modList.sourceKeys', { count: mod.sourceKeys })}</div>
        <div>{t('converter.modList.coveredKeys', { count: coveredKeys })}</div>
      </div>
    </li>
  )
})
