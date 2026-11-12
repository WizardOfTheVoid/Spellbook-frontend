import type { IpcMain } from 'electron'
import type { OverlayWindowController } from '../window/overlay-window-controller'
import type { AppUpdateService } from './appUpdateService'

export class AppUpdateIpc {
  constructor(
    private readonly ipc: Pick<IpcMain, `handle` | `removeHandler`>,
    private readonly updates: AppUpdateService,
    private readonly window: Pick<OverlayWindowController, `getCurrent` | `sendToCurrent`>,
  ) {}

  register(): () => void {
    const operations = {
      check: () => this.updates.check(),
      open: () => this.updates.openLatestRelease(),
      state: () => this.updates.getState(),
      install: () => this.updates.restartAndInstall(),
      restart: () => this.updates.restartApplication(),
    }
    for (const [name, run] of Object.entries(operations)) {
      this.ipc.handle(`app:update:${name}`, async (event) => {
        if (
          event.sender !== this.window.getCurrent()?.webContents ||
          !event.senderFrame ||
          event.senderFrame !== event.sender.mainFrame
        ) {
          throw new Error(`Updates are only available in the main SpellBook window.`)
        }
        return run()
      })
    }
    const unsubscribe = this.updates.subscribe((state) => this.window.sendToCurrent(`app:update:changed`, state))
    return () => {
      unsubscribe()
      for (const name of Object.keys(operations)) this.ipc.removeHandler(`app:update:${name}`)
    }
  }
}
