import type { IpcMain } from 'electron'
import type { OverlayWindowController } from '../window/overlay-window-controller'
import type { CommandHistoryService } from './commandHistoryService'
import { initialCommandHistoryState } from '../../shared/commandHistory/commandHistory'

export class CommandHistoryIpc {
  constructor(private readonly ipc: Pick<IpcMain, `handle`>,
    private readonly history: Pick<CommandHistoryService, `getState` | `subscribe`>,
    private readonly window: Pick<OverlayWindowController, `getCurrent` | `sendToCurrent`>,
    private readonly allowed: () => boolean) {}

  register(): void {
    this.ipc.handle(`core:commandHistory`, event => {
      if (!this.allowed() || event.sender !== this.window.getCurrent()?.webContents || !event.senderFrame || event.senderFrame !== event.sender.mainFrame) {
        throw new Error(`Command history is only available to the signed-in main SpellBook window.`)
      }
      return this.history.getState()
    })
    this.history.subscribe(state => this.window.sendToCurrent(`core:commandHistoryChanged`, this.allowed()
      ? state : { ...initialCommandHistoryState, revision: state.revision }))
  }
}
