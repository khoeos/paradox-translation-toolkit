import { is } from '@electron-toolkit/utils'
import { app, BrowserWindow, shell } from 'electron'
import electronUpdater from 'electron-updater'
import { join } from 'node:path'

import { IPC_CHANNELS } from '@ptt/shared-types'

const { autoUpdater } = electronUpdater

// Build-time flag injected by Vite. True only when CI built this binary with a
// Windows code-signing certificate. See electron.vite.config.ts and
// docs/publishing.md.
// eslint-disable-next-line no-underscore-dangle
declare const __WIN_SIGNED__: boolean

const RELEASES_URL = 'https://github.com/khoeos/paradox-translation-toolkit/releases/latest'

export type UpdaterStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'ready'
  | 'error'
  | 'disabled'

export interface UpdaterState {
  status: UpdaterStatus
  currentVersion: string
  latestVersion: string | null
  downloadProgress: number
  errorMessage: string | null
  releaseNotes: string | null
  /** True iff this build can auto-download + auto-install via `electron-updater`. */
  autoUpdateSupported: boolean
  /** Canonical URL of the GitHub release page (used as fallback). */
  releaseUrl: string
}

export type UpdaterEvent =
  | { type: 'checking' }
  | { type: 'available'; version: string; releaseNotes: string | null }
  | { type: 'not-available'; version: string }
  | { type: 'download-progress'; percent: number }
  | { type: 'ready'; version: string }
  | { type: 'error'; message: string }
  | { type: 'redirected-to-browser'; version: string | null }

export class UpdaterService {
  private state: UpdaterState
  private readonly autoUpdateSupported: boolean

  constructor() {
    this.autoUpdateSupported = process.platform === 'win32' && __WIN_SIGNED__

    this.state = {
      status: 'idle',
      currentVersion: app.getVersion(),
      latestVersion: null,
      downloadProgress: 0,
      errorMessage: null,
      releaseNotes: null,
      autoUpdateSupported: this.autoUpdateSupported,
      releaseUrl: RELEASES_URL
    }

    if (is.dev) {
      // In dev, electron-builder.yml isn't applied, point to dev-app-update.yml.
      autoUpdater.updateConfigPath = join(app.getAppPath(), 'dev-app-update.yml')
      autoUpdater.forceDevUpdateConfig = true
    }

    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = false
    autoUpdater.allowPrerelease = false
    autoUpdater.channel = 'latest'

    // Listeners wired unconditionally; only the download step is platform-gated.
    autoUpdater.on('checking-for-update', () => {
      this.state = { ...this.state, status: 'checking', errorMessage: null }
      this.broadcast({ type: 'checking' })
    })

    autoUpdater.on('update-available', info => {
      const releaseNotes = normalizeReleaseNotes(info.releaseNotes)
      this.state = {
        ...this.state,
        status: 'available',
        latestVersion: info.version,
        releaseNotes
      }
      this.broadcast({ type: 'available', version: info.version, releaseNotes })
    })

    autoUpdater.on('update-not-available', info => {
      this.state = { ...this.state, status: 'not-available', latestVersion: info.version }
      this.broadcast({ type: 'not-available', version: info.version })
    })

    autoUpdater.on('download-progress', progress => {
      this.state = {
        ...this.state,
        status: 'downloading',
        downloadProgress: Math.round(progress.percent)
      }
      this.broadcast({ type: 'download-progress', percent: this.state.downloadProgress })
    })

    autoUpdater.on('update-downloaded', info => {
      this.state = { ...this.state, status: 'ready', latestVersion: info.version }
      this.broadcast({ type: 'ready', version: info.version })
    })

    autoUpdater.on('error', err => {
      const message = err instanceof Error ? err.message : String(err)
      this.state = { ...this.state, status: 'error', errorMessage: message }
      this.broadcast({ type: 'error', message })
    })
  }

  getState(): UpdaterState {
    return this.state
  }

  /** Affects the NEXT `check()` call. */
  applyConfig(opts: { channel: 'stable' | 'beta' }): void {
    if (opts.channel === 'beta') {
      autoUpdater.channel = 'beta'
      autoUpdater.allowPrerelease = true
    } else {
      autoUpdater.channel = 'latest'
      autoUpdater.allowPrerelease = false
    }
  }

  async check(): Promise<void> {
    try {
      await autoUpdater.checkForUpdates()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.state = { ...this.state, status: 'error', errorMessage: message }
      this.broadcast({ type: 'error', message })
    }
  }

  /**
   * Signed Windows: download in place. Every other build: open GitHub Releases.
   * Auto-installing without a code-signing cert would be a supply-chain risk.
   */
  async download(): Promise<void> {
    if (!this.autoUpdateSupported) {
      void shell.openExternal(this.state.releaseUrl)
      this.broadcast({ type: 'redirected-to-browser', version: this.state.latestVersion })
      return
    }
    if (this.state.status !== 'available') return
    try {
      this.state = { ...this.state, status: 'downloading', downloadProgress: 0 }
      this.broadcast({ type: 'download-progress', percent: 0 })
      await autoUpdater.downloadUpdate()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.state = { ...this.state, status: 'error', errorMessage: message }
      this.broadcast({ type: 'error', message })
    }
  }

  installNow(): void {
    if (!this.autoUpdateSupported) return
    if (this.state.status !== 'ready') return
    autoUpdater.quitAndInstall(false, true)
  }

  private broadcast(event: UpdaterEvent): void {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(IPC_CHANNELS.updaterEvent, event)
    }
  }
}

function normalizeReleaseNotes(
  notes: string | { note: string | null }[] | null | undefined
): string | null {
  if (!notes) return null
  if (typeof notes === 'string') return notes
  return (
    notes
      .map(n => n.note ?? '')
      .filter(Boolean)
      .join('\n\n') || null
  )
}
