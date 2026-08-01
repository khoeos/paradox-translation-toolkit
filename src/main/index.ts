import { app, shell, BrowserWindow, ipcMain, dialog, IpcMainEvent } from 'electron'
import { join } from 'path'
import { rm } from 'fs/promises'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import workerPath from './worker?modulePath'
import { Worker } from 'worker_threads'
import { Request } from './translateFn'
import { createProvider } from './translate/providers'
import {
  ConversionStatus,
  ConversionStatusType,
  IpcKey,
  TranslateConfig,
  WorkerAction
} from '../global/types'

// Un seul travail à la fois, la référence sert à l'annulation et à l'arrêt
let currentWorker: Worker | null = null

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    // x: 3430,
    // y: 0,
    width: 1080,
    height: 670,
    show: false,
    resizable: true,
    fullscreenable: true,
    autoHideMenuBar: true,
    title: 'Paradox Translation Toolki',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      nodeIntegrationInWorker: true
    }
  })

  mainWindow.on('closed', () => {
    // A worker still translating would keep the process alive and pop an error dialog
    currentWorker?.terminate()
    currentWorker = null
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
    mainWindow.setTitle('Paradox Translation Toolkit')
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // mainWindow.webContents.openDevTools({ mode: 'detach' })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  ipcMain.on(IpcKey.SELECT_FOLDER_START, () => {
    dialog.showOpenDialog({ properties: ['openDirectory'] }).then((result) => {
      if (!result.canceled) {
        mainWindow.webContents.send(IpcKey.SELECT_FOLDER_RESULT, result.filePaths[0])
      }
    })
  })

  ipcMain.on(IpcKey.SELECT_OUTPUT_START, () => {
    dialog.showOpenDialog({ properties: ['openDirectory'] }).then((result) => {
      if (!result.canceled) {
        mainWindow.webContents.send(IpcKey.SELECT_OUTPUT_RESULT, result.filePaths[0])
      }
    })
  })

  ipcMain.on(IpcKey.SELECT_GAME_START, () => {
    dialog.showOpenDialog({ properties: ['openDirectory'] }).then((result) => {
      if (!result.canceled) {
        mainWindow.webContents.send(IpcKey.SELECT_GAME_RESULT, result.filePaths[0])
      }
    })
  })

  ipcMain.on(IpcKey.OPEN_FOLDER, (_, path: string) => {
    shell.openPath(path)
  })

  const startWorker = (event: IpcMainEvent, request: Request, action: WorkerAction): void => {
    currentWorker?.terminate()

    event.sender.send(IpcKey.CONVERT_STATUS, {
      type: ConversionStatusType.STATUS,
      status: ConversionStatus.STARTED
    })
    const worker = new Worker(workerPath, {})
    currentWorker = worker

    // Electron n'est pas disponible dans le worker, on résout les dossiers ici
    worker.postMessage({
      ...request,
      action,
      documentsPath: app.getPath('documents'),
      userDataPath: app.getPath('userData')
    })

    // Récupère les logs une fois la traduction terminée
    worker.on('message', (statusUpdate) => {
      event.sender.send(IpcKey.CONVERT_STATUS, statusUpdate)
    })

    // Gestion des erreurs
    worker.on('error', (error) => {
      console.error('Worker error:', error)
      event.sender.send(IpcKey.CONVERT_STATUS, {
        type: ConversionStatusType.STATUS,
        status: ConversionStatus.ERROR,
        error: error.message
      })
    })

    // Gestion de la fin du worker
    worker.on('exit', (code) => {
      if (worker === currentWorker) currentWorker = null
      if (code !== 0) {
        console.error(`Worker stopped with exit code ${code}`)
      }
    })
  }

  ipcMain.on(IpcKey.CONVERT_START, (event: IpcMainEvent, request: Request) => {
    startWorker(event, request, WorkerAction.CONVERT)
  })

  ipcMain.on(IpcKey.SCAN_START, (event: IpcMainEvent, request: Request) => {
    startWorker(event, request, WorkerAction.SCAN)
  })

  ipcMain.on(IpcKey.CONVERT_CANCEL, () => {
    // Le worker s'arrête de lui-même entre deux unités de travail
    currentWorker?.postMessage({ cancel: true })
  })

  ipcMain.on(IpcKey.CLEAR_MEMORY, async () => {
    // Only the remembered translations go: the glossary is rebuilt from the game anyway
    const folder = join(app.getPath('userData'), 'translation-memory')
    try {
      await rm(folder, { recursive: true, force: true })
      mainWindow.webContents.send(IpcKey.CLEAR_MEMORY_RESULT, { ok: true })
    } catch (error) {
      mainWindow.webContents.send(IpcKey.CLEAR_MEMORY_RESULT, {
        ok: false,
        error: (error as Error).message
      })
    }
  })

  ipcMain.on(IpcKey.TEST_PROVIDER, async (_, config: TranslateConfig) => {
    try {
      const provider = createProvider(config)
      const [answer] = await provider.translate(['Colony Ship'], 'Russian')
      mainWindow.webContents.send(IpcKey.TEST_PROVIDER_RESULT, { ok: true, sample: answer })
    } catch (error) {
      mainWindow.webContents.send(IpcKey.TEST_PROVIDER_RESULT, {
        ok: false,
        error: (error as Error).message
      })
    }
  })
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
// Electron shows an undismissable modal for these; a log is enough and the app stays usable
process.on('uncaughtException', (error) => console.error('Uncaught exception:', error))
process.on('unhandledRejection', (reason) => console.error('Unhandled rejection:', reason))

app.on('before-quit', () => {
  currentWorker?.terminate()
  currentWorker = null
})

app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.pttk.app')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app"s specific main process
// code. You can also put them in separate files and require them here.
