import type { IpcRenderer } from 'electron'
import type { DebugControlApi, DebugSessionSnapshot } from '../shared/debug'
import type { DebugActivityApi, GameActivitySnapshot } from '../shared/gameActivity'

type DebugIpc = Pick<IpcRenderer, `invoke` | `on` | `removeListener`>

export function createDebugObserver(ipc: DebugIpc): Pick<DebugControlApi, `getState` | `onState`> & DebugActivityApi {
  return {
    getState: () => ipc.invoke(`debug:get-state`),
    onState: callback => subscribe<DebugSessionSnapshot>(ipc, `debug:state`, callback),
    onActivity: callback => subscribe<GameActivitySnapshot | null>(ipc, `debug:activity`, callback)
  }
}

export function createDebugBridge(ipc: DebugIpc): DebugControlApi & DebugActivityApi {
  const call = (operation: string, ...args: unknown[]) => ipc.invoke(`debug:control`, operation, args)
  return {
    ...createDebugObserver(ipc),
    setArmed: armed => call(`setArmed`, armed),
    run: slot => call(`run`, slot),
    stop: () => call(`stop`),
    savePreset: preset => call(`savePreset`, preset),
    resetPresets: () => call(`resetPresets`),
    preview: preset => call(`preview`, preset),
    queue: (operation, id) => call(`queue`, operation, id),
    setProducerPaused: (producer, paused) => call(`setProducerPaused`, producer, paused),
    configure: layout => call(`configure`, layout),
    settings: (values, save, reset) => call(`settings`, values, save, reset),
    record: enabled => call(`record`, enabled),
    mark: label => call(`mark`, label),
    exportRecording: () => call(`exportRecording`)
  }
}

function subscribe<T>(ipc: DebugIpc, channel: string, callback: (value: T) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, value: T): void => callback(value)
  ipc.on(channel, listener)
  return () => { ipc.removeListener(channel, listener) }
}
