import type { IpcMain } from 'electron'
import type { SentinelService } from '../services/sentinelService'
import type { OverlayWindowController } from '../window/overlay-window-controller'

export class SentinelIpcHandlers {
  constructor(
    private readonly ipcMain: IpcMain,
    private readonly sentinel: SentinelService,
    private readonly overlayWindow: OverlayWindowController
  ) {}

  register(): void {
    this.ipcMain.handle(`core:sentinelState`, () => this.sentinel.getState())
    this.ipcMain.handle(`core:setSentinelEnabled`, async (_event, payload: unknown) => {
      if (!SentinelIpcHandlers.isPayload(payload)) {
        throw new TypeError(`Sentinel enabled must be a boolean.`)
      }

      return await this.sentinel.setEnabled(payload.enabled)
    })
    this.sentinel.subscribe(state => {
      this.overlayWindow.sendToCurrent(`core:sentinelStateChanged`, state)
    })
  }

  private static isPayload(payload: unknown): payload is { enabled: boolean } {
    return typeof payload === `object`
      && payload !== null
      && typeof (payload as { enabled?: unknown }).enabled === `boolean`
  }
}
