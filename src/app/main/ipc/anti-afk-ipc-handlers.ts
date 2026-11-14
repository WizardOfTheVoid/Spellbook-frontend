import type { IpcMain } from 'electron'
import type { AntiAfkService } from '../services/anti-afk-service'
import type { AntiAfkPayload } from '../types'

export class AntiAfkIpcHandlers {
  constructor(
    private readonly ipcMain: IpcMain,
    private readonly antiAfk: AntiAfkService
  ) {}

  register(): void {
    this.ipcMain.handle(`core:antiAfkState`, () => this.antiAfk.getState())
    this.ipcMain.handle(`core:setAntiAfkEnabled`, (_event, payload: AntiAfkPayload) =>
      this.antiAfk.setEnabled(payload?.enabled === true)
    )
  }
}
