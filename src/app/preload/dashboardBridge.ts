import type { IpcRenderer } from 'electron'

export type DashboardIpcRenderer = Pick<IpcRenderer, `invoke`>

export function createDashboardBridge(ipcRenderer: DashboardIpcRenderer) {
  return {
    dashboard: {
      get: () => ipcRenderer.invoke(`server:dashboard:get`),
    },
  }
}
