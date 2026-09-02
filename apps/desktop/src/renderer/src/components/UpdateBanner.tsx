import { Download, ExternalLink, RefreshCcw, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@ptt/ui/components/button'
import { Progress } from '@ptt/ui/components/progress'
import { cn } from '@ptt/ui/lib/utils'

import { trpc } from '@renderer/lib/trpc'
import { isUpdateBannerVisible, useUpdaterStore } from '@renderer/store/updater'

export function UpdateBanner() {
  const { t } = useTranslation()
  const status = useUpdaterStore(s => s.status)
  const latestVersion = useUpdaterStore(s => s.latestVersion)
  const downloadProgress = useUpdaterStore(s => s.downloadProgress)
  const dismiss = useUpdaterStore(s => s.dismiss)
  const visible = useUpdaterStore(isUpdateBannerVisible)
  const autoUpdateSupported = useUpdaterStore(s => s.autoUpdateSupported)

  const downloadMutation = trpc.updater.download.useMutation()
  const installMutation = trpc.updater.installNow.useMutation()

  if (!visible) return null

  const isAvailable = status === 'available'
  // `downloading` and `ready` are only reachable on auto-update-capable builds.
  // We still render defensively in case state desyncs.
  const isDownloading = status === 'downloading' && autoUpdateSupported
  const isReady = status === 'ready' && autoUpdateSupported

  return (
    <div
      className={cn(
        'fixed top-16 left-1/2 -translate-x-1/2 z-40',
        'flex items-center gap-3 px-4 py-2.5 rounded-lg border shadow-lg',
        'bg-background text-foreground',
        isReady ? 'border-green-500/50' : 'border-primary/50'
      )}
      role="status"
    >
      {isAvailable ? (
        <>
          {autoUpdateSupported ? (
            <Download className="w-4 h-4 text-primary" />
          ) : (
            <ExternalLink className="w-4 h-4 text-primary" />
          )}
          <span className="text-sm">
            {t('updater.banner.available', { version: latestVersion ?? '' })}
          </span>
          <Button
            size="sm"
            onClick={() => downloadMutation.mutate()}
            disabled={downloadMutation.isPending}
          >
            {autoUpdateSupported ? t('updater.banner.download') : t('updater.banner.openInBrowser')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={dismiss}
            aria-label={t('updater.banner.dismiss')}
          >
            <X className="w-4 h-4" />
          </Button>
        </>
      ) : null}

      {isDownloading ? (
        <>
          <Download className="w-4 h-4 text-primary animate-pulse" />
          <span className="text-sm">
            {t('updater.banner.downloading', { percent: downloadProgress })}
          </span>
          <div className="w-32">
            <Progress value={downloadProgress} />
          </div>
        </>
      ) : null}

      {isReady ? (
        <>
          <RefreshCcw className="w-4 h-4 text-green-500" />
          <span className="text-sm">
            {t('updater.banner.ready', { version: latestVersion ?? '' })}
          </span>
          <Button
            size="sm"
            onClick={() => installMutation.mutate()}
            disabled={installMutation.isPending}
          >
            {t('updater.banner.restart')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={dismiss}
            aria-label={t('updater.banner.dismiss')}
          >
            <X className="w-4 h-4" />
          </Button>
        </>
      ) : null}
    </div>
  )
}
