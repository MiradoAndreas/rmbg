import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('desktop', Object.freeze({ platform: process.platform }))
