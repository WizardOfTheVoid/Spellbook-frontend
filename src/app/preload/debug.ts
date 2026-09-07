import { contextBridge, ipcRenderer } from 'electron'
import type { DebugActivityApi, GameActivitySnapshot } from '../shared/gameActivity'

const api: DebugActivityApi = {
  onActivity: callback => {
    const listener = (_event: Electron.IpcRendererEvent, activity: GameActivitySnapshot | null): void => callback(activity)
    ipcRenderer.on(`debug:activity`, listener)
    return () => { ipcRenderer.removeListener(`debug:activity`, listener) }
  }
}

contextBridge.exposeInMainWorld(`chivDebug`, api)
