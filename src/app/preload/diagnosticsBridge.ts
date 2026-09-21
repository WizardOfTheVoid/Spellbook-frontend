import type { IpcRenderer } from 'electron'
import type { DiagnosticsApi } from '../shared/diagnosticLogs'

export function createDiagnosticsBridge(ipcRenderer: Pick<IpcRenderer, `send` | `invoke`>): DiagnosticsApi {
  return {
    write: entry => ipcRenderer.send(`diagnostics:write`, entry),
    exportLogs: () => ipcRenderer.invoke(`diagnostics:export`),
  }
}
