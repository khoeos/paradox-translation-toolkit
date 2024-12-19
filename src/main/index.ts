import { app, shell, BrowserWindow, ipcMain, dialog, IpcMainEvent } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import workerPath from './worker?modulePath'
import { Worker } from 'worker_threads'
import { Request } from './convertFn'
import { ConversionStatus, ConversionStatusType, IpcKey } from '../global/types'
import { exploreFolder } from './exploreFn/explore'
import { createFile, parseFiles } from './exploreFn/parseFiles'

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    x: 3430,
    y: 0,
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

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
    mainWindow.setTitle('Paradox Translation Toolkit')
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  mainWindow.webContents.openDevTools({ mode: 'detach' })

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

  ipcMain.on(IpcKey.SELECT_FOLDER_EXPLORER, () => {
    dialog.showOpenDialog({ properties: ['openDirectory'] }).then((result) => {
      if (!result.canceled) {
        exploreFolder(result.filePaths[0])

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

  ipcMain.on(IpcKey.OPEN_FOLDER, (_, path: string) => {
    shell.openPath(path)
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ipcMain.on(IpcKey.CONVERT_START, (event: IpcMainEvent, request: Request) => {
    event.sender.send(IpcKey.CONVERT_STATUS, {
      type: ConversionStatusType.STATUS,
      status: ConversionStatus.STARTED
    })
    const worker = new Worker(workerPath, {})

    // Envoie la requête de traduction au worker
    worker.postMessage(request)

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
        error
      })
    })

    // Gestion de la fin du worker
    worker.on('exit', (code) => {
      if (code !== 0) {
        console.error(`Worker stopped with exit code ${code}`)
      }
    })
  })

  ipcMain.on('parseFile', async (event: IpcMainEvent, request: Request) => {
    try {
      // const result = await parseFiles(
      //   'C:/Users/Ljeanjean/Documents/Paradox text/new/3412590987/localisation'
      // )
      createFile()
      console.log('Result of parseFiles:', result) // Debug output
      event.sender.send('parseFileResult', result)
    } catch (err) {
      console.error('Error in parseFile handler:', err)
      event.sender.send('parseFileResult', { error: err.message })
    }
  })
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
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
