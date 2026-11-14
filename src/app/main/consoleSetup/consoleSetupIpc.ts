import type { IpcMain } from 'electron'
import type { ConsoleSetupService } from './consoleSetupService'
import type { OverlayWindowController } from '../window/overlay-window-controller'
import { isConsoleKeyCode } from '../../shared/consoleKey'
import { isKeyboardLayoutId } from '../../shared/keyboardLayout'

export class ConsoleSetupIpc {
  constructor(
    private readonly ipc: Pick<IpcMain, `handle`>,
    private readonly setup: ConsoleSetupService,
    private readonly window: Pick<OverlayWindowController, `getCurrent` | `sendToCurrent`>
  ) {}

  register(): void {
    const operations = {
      consoleSetupState: () => this.setup.getState(),
      checkConsoleEnabled: () => this.setup.checkConsoleEnabled(),
      enableConsole: () => this.setup.enableConsole(),
      checkConsoleBind: (value: unknown) => this.setup.checkConsoleBind(value === true),
      recordConsoleKey: (value: unknown) => isConsoleKeyCode(value) ? this.setup.recordConsoleKey(value) : false,
      setConsoleLayout: (value: unknown) => isKeyboardLayoutId(value) ? this.setup.setConsoleLayout(value) : false,
      refreshKeyboardLayouts: () => this.setup.refreshKeyboardLayouts(),
      retryKeyboardLayoutRestore: () => this.setup.retryKeyboardLayoutRestore()
    }
    for (const [name, run] of Object.entries(operations)) {
      this.ipc.handle(`core:${name}`, (event, retry?: unknown) => {
        if (event.sender !== this.window.getCurrent()?.webContents || !event.senderFrame || event.senderFrame !== event.sender.mainFrame) {
          throw new Error(`Console setup is only available in the main SpellBook window.`)
        }
        return run(retry)
      })
    }
    this.setup.subscribe(state => this.window.sendToCurrent(`core:consoleSetupStateChanged`, state))
  }
}
