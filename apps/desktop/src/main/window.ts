import { is } from '@electron-toolkit/utils'
import { BrowserWindow, shell } from 'electron'
import windowStateKeeper from 'electron-window-state'
import { join } from 'node:path'

export function createMainWindow(): BrowserWindow {
  const state = windowStateKeeper({
    defaultWidth: 1200,
    defaultHeight: 800
  })

  const linuxIcon =
    process.platform === 'linux' ? join(__dirname, '../../resources/icon.png') : null
  const win = new BrowserWindow({
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
    minWidth: 800,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    title: 'Paradox Translation Toolkit',
    ...(linuxIcon !== null && { icon: linuxIcon }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  state.manage(win)

  win.on('ready-to-show', () => {
    win.show()
  })

  // Filter protocols on outbound link clicks: only http(s)/mailto reach the OS
  // shell. file:// and other schemes can launch arbitrary executables.
  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url)
      if (
        parsed.protocol === 'http:' ||
        parsed.protocol === 'https:' ||
        parsed.protocol === 'mailto:'
      ) {
        void shell.openExternal(url)
      }
    } catch {
      // Malformed URL, ignore.
    }
    return { action: 'deny' }
  })

  // Block top-level navigation away from the currently loaded URL.
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win.webContents.getURL()) {
      event.preventDefault()
    }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  if (is.dev) {
    win.webContents.openDevTools({ mode: 'detach' })
  }

  return win
}
