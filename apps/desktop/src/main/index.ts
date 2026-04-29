import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { app, BrowserWindow, crashReporter, session } from 'electron'

import { setupTrpcIpcBridge } from './ipc/bridge.js'
import { createContext } from './ipc/context.js'
import { appRouter } from './ipc/trpc-router.js'
import { initializeLogger } from './log.js'
import { createConverterService } from './services/converter-service.js'
import { configureDialogService } from './services/dialog-service.js'
import { OpenableRegistry } from './services/openable-registry.js'
import { SettingsService } from './services/settings-service.js'
import { UpdaterService } from './services/updater-service.js'
import { createMainWindow } from './window.js'

initializeLogger()

// Capture native crashes as minidumps under `app.getPath('crashDumps')`.
// Not uploaded; users can attach them to a GitHub issue.
crashReporter.start({
  uploadToServer: false,
  productName: 'Paradox Translation Toolkit',
  companyName: 'Khoeos'
})

// Reject <webview> attachment to close off a class of RCE vectors.
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-attach-webview', event => {
    event.preventDefault()
  })
})

// Production CSP injected as a header. The <meta> tag in index.html is a fallback.
// Skipped in dev so Vite's HMR transports stay functional.
const PROD_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; " +
  "object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'"

function applyContentSecurityPolicy(): void {
  if (is.dev) return
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [PROD_CSP]
      }
    })
  })
}

void app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.ptt.app')
  applyContentSecurityPolicy()

  app.on('browser-window-created', (_event, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  const openable = new OpenableRegistry()
  const settings = new SettingsService()
  const converter = createConverterService(openable)
  const updater = new UpdaterService()
  configureDialogService({ settings, openable })
  createMainWindow()

  setupTrpcIpcBridge({
    router: appRouter,
    ctx: createContext({ converter, settings, updater, openable })
  })

  const settingsSnapshot = settings.getAll()
  updater.applyConfig({ channel: settingsSnapshot.updateChannel })

  // Seed the openable registry with previously configured paths.
  for (const v of Object.values(settingsSnapshot.lastModFolder)) {
    if (v !== undefined) openable.add(v)
  }
  for (const v of Object.values(settingsSnapshot.lastOutputFolder)) {
    if (v !== undefined) openable.add(v)
  }

  // Allow opening the log folder without going through the bypass modal.
  openable.add(app.getPath('logs'))

  if (settingsSnapshot.autoCheckUpdates) {
    setTimeout(() => {
      void updater.check()
    }, 5_000)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
