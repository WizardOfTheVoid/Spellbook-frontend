import type { IpcMain, IpcMainEvent, IpcMainInvokeEvent } from 'electron'
import type { DiagnosticLogService } from '../services/diagnosticLogService'
import type { LogExportResult } from '../../shared/diagnosticLogs'

type LogEvent = IpcMainEvent | IpcMainInvokeEvent
type SelectLogDestination = (event: IpcMainInvokeEvent) => Promise<string | undefined>

export class DiagnosticLogIpcHandlers {
  private exporting = false

  constructor(
    private readonly ipcMain: Pick<IpcMain, `handle` | `on`>,
    private readonly logs: DiagnosticLogService,
    private readonly selectDestination: SelectLogDestination,
    private readonly rendererUrl: string,
  ) {}

  register(): void {
    this.ipcMain.on(`diagnostics:write`, (event, payload: unknown) => {
      if (!this.isRenderer(event) || !payload || typeof payload !== `object`) return
      const { level, message } = payload as Record<string, unknown>
      if ((level !== `info` && level !== `warn` && level !== `error`) || typeof message !== `string`) return
      this.logs.write(`renderer`, { level, message })
    })
    this.ipcMain.handle(`diagnostics:export`, async (event): Promise<LogExportResult> => {
      if (!this.isRenderer(event)) return { status: `error` }
      if (this.exporting) return { status: `cancelled` }
      this.exporting = true
      try {
        const destination = await this.selectDestination(event)
        if (!destination) return { status: `cancelled` }
        await this.logs.exportTo(destination)
        return { status: `saved` }
      } catch {
        this.logs.write(`main`, { level: `error`, message: `Diagnostic log export failed.` })
        return { status: `error` }
      } finally {
        this.exporting = false
      }
    })
  }

  private isRenderer(event: LogEvent): boolean {
    if (!event.senderFrame || event.senderFrame !== event.sender.mainFrame) return false
    try {
      const actual = new URL(event.senderFrame.url)
      const expected = new URL(this.rendererUrl)
      return actual.protocol === expected.protocol && actual.host === expected.host
    } catch {
      return false
    }
  }
}
