import { app, ipcMain } from 'electron'
import updater from 'electron-updater'

export function setupUpdates(getWindow, isTrusted) {
  const { autoUpdater } = updater
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.allowPrerelease = false
  let busy = false
  let state = { status: 'idle', currentVersion: app.getVersion() }
  const send = (next) => {
    state = { currentVersion: app.getVersion(), ...next }
    const window = getWindow()
    if (window && !window.isDestroyed()) window.webContents.send('updates:state', state)
    return state
  }
  const fail = (error) => {
    console.error('Updater:', error)
    return send({ status: 'error', message: 'Update failed. Check your connection and try again. A published release must be available.' })
  }
  autoUpdater.on('checking-for-update', () => send({ status: 'checking' }))
  autoUpdater.on('update-available', (info) => send({ status: 'available', version: info.version }))
  autoUpdater.on('update-not-available', () => send({ status: 'current' }))
  autoUpdater.on('download-progress', (progress) => send({ status: 'downloading', percent: Math.round(progress.percent) }))
  autoUpdater.on('update-downloaded', (info) => send({ status: 'downloaded', version: info.version }))
  autoUpdater.on('error', fail)

  function assertTrusted(event) {
    if (!isTrusted(event)) throw new Error('Untrusted update request')
  }
  ipcMain.handle('updates:state', (event) => {
    assertTrusted(event)
    return state
  })
  ipcMain.handle('updates:action', async (event) => {
    assertTrusted(event)
    if (busy) return state
    if (!app.isPackaged) return send({ status: 'unsupported', message: 'Updates are available in the installed app.' })
    if (!['win32', 'linux'].includes(process.platform) || (process.platform === 'linux' && !process.env.APPIMAGE)) {
      return send({ status: 'unsupported', message: 'Use the installed Windows app or run the Linux AppImage to update.' })
    }
    if (state.status === 'downloaded') {
      // The app's before-quit handler stops the backend once installation succeeds.
      // Keep processing available if the updater cannot launch its installer.
      autoUpdater.quitAndInstall(false, true)
      return state
    }
    busy = true
    try {
      if (state.status === 'available') {
        send({ status: 'downloading', percent: 0 })
        await autoUpdater.downloadUpdate()
      } else {
        await autoUpdater.checkForUpdates()
      }
    } catch (error) {
      fail(error)
    } finally {
      busy = false
    }
    return state
  })
}
