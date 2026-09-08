import { Link } from '@tanstack/react-router'
import { Bug, SettingsIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { UI_LANGUAGES, type UiLanguage, isUiLanguage } from '@ptt/i18n'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@ptt/ui/components/select'
import { cn } from '@ptt/ui/lib/utils'

import { ReportProblemDialog } from '@renderer/components/ReportProblemDialog'
import { trpc } from '@renderer/lib/trpc'

const links = [
  { to: '/', key: 'header.nav.converter' }
  // { to: '/explorer', key: 'header.nav.explorer' },
  // { to: '/edit', key: 'header.nav.editor' },
  // { to: '/settings', key: 'header.nav.settings' }
] as const

function UiLanguageSelect() {
  const utils = trpc.useUtils()
  const { data: settings } = trpc.settings.getAll.useQuery()
  const update = trpc.settings.update.useMutation({
    onSuccess: () => utils.settings.getAll.invalidate()
  })

  const current: UiLanguage = isUiLanguage(settings?.uiLanguage) ? settings.uiLanguage : 'en'

  return (
    <Select
      value={current}
      onValueChange={value => {
        if (isUiLanguage(value)) update.mutate({ uiLanguage: value })
      }}
    >
      <SelectTrigger size="sm" className="h-full!" aria-label="UI language">
        <SelectValue />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false} align="end">
        {UI_LANGUAGES.map(lang => (
          <SelectItem key={lang.code} value={lang.code}>
            {lang.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function ReportButton() {
  const { t } = useTranslation()
  const { data: enabled } = trpc.report.isEnabled.useQuery()

  if (!enabled) return null

  return (
    <ReportProblemDialog
      trigger={open => (
        <button
          type="button"
          onClick={open}
          aria-label={t('report.reportBug')}
          title={t('report.reportBug')}
          className={cn(
            'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
            'text-muted-foreground hover:text-foreground hover:bg-accent'
          )}
        >
          <Bug className="h-5 w-5" />
        </button>
      )}
    />
  )
}

export function Header() {
  const { t } = useTranslation()
  return (
    <header className="fixed top-0 right-0 left-0 z-50 flex items-center justify-between border-b bg-background/80 px-6 py-3 backdrop-blur">
      <div>
        <h1 className="text-base font-semibold tracking-wide">Paradox Translation Toolkit</h1>
        <p className="text-xs text-muted-foreground">{t('header.subtitle')}</p>
      </div>
      <nav className="flex items-center gap-2">
        {links.map(link => (
          <Link
            key={link.to}
            to={link.to}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              'text-muted-foreground hover:text-foreground hover:bg-accent'
            )}
            activeProps={{ className: 'text-foreground bg-accent' }}
          >
            {t(link.key)}
          </Link>
        ))}
        <UiLanguageSelect />
        <ReportButton />
        <Link
          to={'/settings'}
          className={cn(
            'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
            'text-muted-foreground hover:text-foreground hover:bg-accent'
          )}
          activeProps={{ className: 'text-foreground bg-accent' }}
        >
          <SettingsIcon className="h-5 w-6" />
        </Link>
      </nav>
    </header>
  )
}
