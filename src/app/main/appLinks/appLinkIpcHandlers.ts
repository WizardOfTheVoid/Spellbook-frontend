import type { IpcMain } from 'electron'
import type { OverlayWindowController } from '../window/overlay-window-controller'
import { AppLinkInbox } from './appLinkInbox'

export class AppLinkIpcHandlers {
  constructor(
    private readonly ipcMain: IpcMain,
    private readonly inbox: AppLinkInbox,
    private readonly overlayWindow: OverlayWindowController
  ) {}

  register(): void {
    this.ipcMain.handle(`app-link:pending`, event =>
      event.sender === this.overlayWindow.getCurrent()?.webContents ? this.inbox.pending() : null)
    this.ipcMain.handle(`app-link:acknowledge`, (event, sequence: unknown) =>
      event.sender === this.overlayWindow.getCurrent()?.webContents
        && typeof sequence === `number` && Number.isSafeInteger(sequence)
        && this.inbox.acknowledge(sequence))
    this.inbox.subscribe(() => { this.overlayWindow.sendToCurrent(`app-link:changed`) })
  }
}
