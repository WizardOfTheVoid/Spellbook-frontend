import type { IpcRenderer } from 'electron'
import type { DashboardQuery, DashboardTimelineQuery } from '@spellbook/shared/dashboard'

export type DashboardIpcRenderer = Pick<IpcRenderer, `invoke`>

export function createDashboardBridge(ipcRenderer: DashboardIpcRenderer) {
  return {
    dashboard: {
      get: (query: DashboardQuery) => ipcRenderer.invoke(`server:dashboard:get`, query),
      timeline: (query: DashboardTimelineQuery) => ipcRenderer.invoke(`server:dashboard:timeline`, query),
    },
  }
}
