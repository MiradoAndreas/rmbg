import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('desktop', {
  platform: process.platform,
  updates: {
    getState: () => ipcRenderer.invoke('updates:state'),
    act: () => ipcRenderer.invoke('updates:action'),
    onState: (callback) => {
      const listener = (_event, state) => callback(state)
      ipcRenderer.on('updates:state', listener)
      return () => ipcRenderer.removeListener('updates:state', listener)
    }
  }
})
