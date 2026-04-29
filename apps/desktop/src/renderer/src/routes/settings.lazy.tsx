import { createLazyRoute } from '@tanstack/react-router'
import { FileText, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { UI_LANGUAGES } from '@ptt/i18n'
import { Button } from '@ptt/ui/components/button'
import { Card, CardContent } from '@ptt/ui/components/card'
import { Label } from '@ptt/ui/components/label'
import { Switch } from '@ptt/ui/components/switch'

import { formatPath } from '@renderer/lib/format-path'
import { trpc } from '@renderer/lib/trpc'

const THEMES = [
  { value: 'system' as const, key: 'settings.themes.system' },
  { value: 'light' as const, key: 'settings.themes.light' },
  { value: 'dark' as const, key: 'settings.themes.dark' }
]

function SettingsPage() {
  const { t } = useTranslation()
  const utils = trpc.useUtils()
  const { data: settings } = trpc.settings.getAll.useQuery()
  const update = trpc.settings.update.useMutation({
    onSuccess: () => utils.settings.getAll.invalidate()
  })
  const reset = trpc.settings.reset.useMutation({
    onSuccess: () => utils.settings.getAll.invalidate()
  })

  if (!settings) return <p className="text-muted-foreground">{t('settings.loading')}</p>

  const theme = settings.themeOverride
  const uiLanguage = settings.uiLanguage ?? 'en'

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h2 className="text-2xl font-semibold tracking-wide">{t('settings.title')}</h2>

      <Card>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>{t('settings.theme')}</Label>
            <div className="flex gap-2">
              {THEMES.map(th => (
                <Button
                  key={th.value}
                  variant={theme === th.value ? 'default' : 'outline'}
                  onClick={() => update.mutate({ themeOverride: th.value })}
                >
                  {t(th.key)}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t('settings.language')}</Label>
            <div className="flex gap-2">
              {UI_LANGUAGES.map(lang => (
                <Button
                  key={lang.code}
                  variant={uiLanguage === lang.code ? 'default' : 'outline'}
                  onClick={() => update.mutate({ uiLanguage: lang.code })}
                >
                  {lang.label}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4">
          <div>
            <Label>{t('settings.lastGame')}</Label>
            <p className="text-sm text-muted-foreground">
              {settings.lastGameId ?? t('settings.noneYet')}
            </p>
          </div>
          <div>
            <Label>{t('settings.lastFolders')}</Label>
            {Object.keys(settings.lastModFolder).length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('settings.noFoldersYet')}</p>
            ) : (
              <ul className="text-sm space-y-1 mt-1">
                {Object.entries(settings.lastModFolder).map(([gameId, path]) => (
                  <li key={gameId} className="font-mono text-xs">
                    <span className="text-muted-foreground">{gameId}</span> → {path}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <Label>{t('settings.defaultMode')}</Label>
            <p className="text-sm text-muted-foreground">{settings.mode}</p>
          </div>
        </CardContent>
      </Card>

      <UpdaterCard />

      <AllowedFoldersCard />

      <DiagnosticsCard />

      <Card>
        <CardContent>
          <Button
            variant="destructive"
            onClick={() => {
              if (window.confirm(t('settings.resetConfirm'))) reset.mutate()
            }}
          >
            {t('settings.resetAll')}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

function DiagnosticsCard() {
  const { t } = useTranslation()
  const openLogs = trpc.app.openLogsFolder.useMutation({
    onError: err => toast.error(t('settings.diagnostics.openLogsError', { message: err.message }))
  })

  return (
    <Card>
      <CardContent className="space-y-3">
        <div>
          <Label>{t('settings.diagnostics.title')}</Label>
          <p className="text-xs text-muted-foreground mt-1">{t('settings.diagnostics.hint')}</p>
        </div>
        <Button variant="outline" onClick={() => openLogs.mutate()}>
          <FileText className="w-4 h-4 mr-2" />
          {t('settings.diagnostics.openLogs')}
        </Button>
      </CardContent>
    </Card>
  )
}

function AllowedFoldersCard() {
  const { t } = useTranslation()
  const utils = trpc.useUtils()
  const { data: settings } = trpc.settings.getAll.useQuery()
  const update = trpc.settings.update.useMutation({
    onSuccess: data => utils.settings.getAll.setData(undefined, data)
  })

  if (!settings) return null

  const folders = settings.userAllowedFolders
  const handleRemove = (path: string): void => {
    update.mutate({ userAllowedFolders: folders.filter(p => p !== path) })
  }

  return (
    <Card>
      <CardContent className="space-y-3">
        <div>
          <Label>{t('settings.allowedFolders.title')}</Label>
          <p className="text-xs text-muted-foreground mt-1">{t('settings.allowedFolders.hint')}</p>
        </div>
        {folders.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('settings.allowedFolders.empty')}</p>
        ) : (
          <ul className="space-y-1">
            {folders.map(path => (
              <li
                key={path}
                className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2"
              >
                <code className="font-mono text-xs truncate" title={path}>
                  {formatPath(path)}
                </code>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleRemove(path)}
                  aria-label={t('settings.allowedFolders.remove')}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function UpdaterCard() {
  const { t } = useTranslation()
  const utils = trpc.useUtils()
  const { data: state } = trpc.updater.getState.useQuery()
  const { data: settings } = trpc.settings.getAll.useQuery()
  const check = trpc.updater.check.useMutation()
  const update = trpc.settings.update.useMutation({
    onSuccess: () => utils.settings.getAll.invalidate()
  })

  if (!state || !settings) return null

  const statusKey = state.status === 'not-available' ? 'notAvailable' : state.status
  const statusLine = t(`updater.statuses.${statusKey}`, {
    version: state.latestVersion ?? '',
    percent: state.downloadProgress,
    message: state.errorMessage ?? ''
  })

  return (
    <Card>
      <CardContent className="space-y-4">
        <div>
          <Label>{t('updater.title')}</Label>
          <p className="text-sm text-muted-foreground mt-1">
            {t('updater.currentVersion', { version: state.currentVersion })}
          </p>
          <p className="text-sm text-muted-foreground">{statusLine}</p>
        </div>

        {!state.autoUpdateSupported ? (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-muted-foreground">
            {t('updater.manualUpdateBanner')}
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col">
            <Label htmlFor="auto-check-updates">{t('updater.autoCheckLabel')}</Label>
            <span className="text-xs text-muted-foreground">{t('updater.autoCheckHint')}</span>
          </div>
          <Switch
            id="auto-check-updates"
            checked={settings.autoCheckUpdates}
            onCheckedChange={checked => update.mutate({ autoCheckUpdates: checked })}
          />
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col">
            <Label htmlFor="beta-channel">{t('updater.betaChannelLabel')}</Label>
            <span className="text-xs text-muted-foreground">{t('updater.betaChannelHint')}</span>
          </div>
          <Switch
            id="beta-channel"
            checked={settings.updateChannel === 'beta'}
            onCheckedChange={checked =>
              update.mutate({ updateChannel: checked ? 'beta' : 'stable' })
            }
          />
        </div>

        <Button
          variant="outline"
          onClick={() => check.mutate()}
          disabled={
            check.isPending || state.status === 'checking' || state.status === 'downloading'
          }
        >
          {t('updater.checkForUpdates')}
        </Button>
      </CardContent>
    </Card>
  )
}

export const Route = createLazyRoute('/settings')({
  component: SettingsPage
})
