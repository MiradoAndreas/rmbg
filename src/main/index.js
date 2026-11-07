import { app, BrowserWindow, dialog, Menu } from 'electron'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'
import { join } from 'node:path'
import { createWriteStream, mkdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { setupUpdates } from './updates'

let backend
let backendUrl
let mainWindow
let quitting = false
let serviceReady = false
let servicePromise
const backendToken = randomUUID()

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close((error) => error ? reject(error) : resolve(port))
    })
  })
}

async function startBackend() {
  if (backendUrl) return backendUrl
  const port = await reservePort()
  const executable = app.isPackaged
    ? join(process.resourcesPath, 'backend', process.platform === 'win32' ? 'clearcut-api.exe' : 'clearcut-api')
    : process.env.CLEARCUT_PYTHON || join(app.getAppPath(), '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
  const args = app.isPackaged ? [] : [join(app.getAppPath(), 'main.py')]
  mkdirSync(app.getPath('logs'), { recursive: true })
  const log = createWriteStream(join(app.getPath('logs'), 'backend.log'), { flags: 'a' })
  let startupError
  backend = spawn(executable, args, {
    env: {
      ...process.env, CLEARCUT_PORT: String(port),
      CLEARCUT_TOKEN: backendToken,
      U2NET_HOME: process.env.U2NET_HOME || join(app.getPath('userData'), 'models'),
      NUMBA_CACHE_DIR: join(app.getPath('userData'), 'numba-cache'),
      ...(app.isPackaged ? { CLEARCUT_STATIC_DIR: join(process.resourcesPath, 'renderer') } : {})
    },
    stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true
  })
  backend.stdout.pipe(log, { end: false })
  backend.stderr.pipe(log, { end: false })
  backend.once('error', (error) => { startupError = error })
  backend.once('exit', () => {
    log.end()
    backendUrl = null
    if (serviceReady && mainWindow && !quitting) {
      dialog.showErrorBox('Image service stopped', 'Restart ClearCut to resume image processing. See backend.log in the application logs directory.')
      app.quit()
    }
  })
  // Initial model download can take several minutes on the first launch.
  for (let attempt = 0; attempt < 1200 && !quitting; attempt += 1) {
    if (startupError) throw startupError
    if (backend.exitCode !== null) throw new Error('The image service exited during startup. See backend.log in the application logs directory.')
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`, {
        headers: { 'X-ClearCut-Token': backendToken }, signal: AbortSignal.timeout(1000)
      })
      if (response.ok) {
        backendUrl = `http://127.0.0.1:${port}`
        return backendUrl
      }
    } catch {}
    await delay(500)
  }
  throw new Error('The image service did not become ready. Check your internet connection for the initial U2Net download and see backend.log.')
}

async function createWindow() {
  if (mainWindow) return mainWindow.focus()
  mainWindow = new BrowserWindow({
    width: 1100, height: 820, minWidth: 760, minHeight: 600,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true
    }
  })
  const window = mainWindow
  window.on('closed', () => { mainWindow = null })
  await window.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(
    '<!doctype html><meta charset="utf-8"><title>ClearCut</title><body style="background:#0b0d12;color:#f4f5f8;font:18px system-ui;padding:64px"><h1>Starting ClearCut…</h1><p>Preparing image processing. The first launch downloads the AI model and may take several minutes.</p></body>'
  ))
  if (quitting || window.isDestroyed()) return
  const origin = await (servicePromise ||= startBackend())
  if (quitting || window.isDestroyed()) return
  serviceReady = true
  mainWindow.webContents.session.webRequest.onBeforeSendHeaders(
    { urls: [`${origin}/*`] },
    (details, callback) => callback({ requestHeaders: { ...details.requestHeaders, 'X-ClearCut-Token': backendToken } })
  )
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (new URL(url).origin !== origin) event.preventDefault()
  })
  mainWindow.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  await mainWindow.loadURL(origin)
}

async function openWindow() {
  try { await createWindow() } catch (error) {
    dialog.showErrorBox('ClearCut could not start', error.message)
    app.quit()
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow?.isMinimized()) mainWindow.restore()
    mainWindow?.focus()
  })
  app.whenReady().then(() => {
    Menu.setApplicationMenu(null)
    setupUpdates(
      () => mainWindow,
      (event) => event.sender === mainWindow?.webContents &&
        event.senderFrame === mainWindow.webContents.mainFrame &&
        backendUrl && new URL(event.senderFrame.url).origin === backendUrl
    )
    return openWindow()
  })
  app.on('activate', () => { if (!mainWindow) openWindow() })
  app.on('before-quit', () => { quitting = true; backend?.kill() })
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
}
