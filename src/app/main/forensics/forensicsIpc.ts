import type { IpcMain } from 'electron'
import type { HttpClient } from '../api/http-client'
import type { OverlayWindowController } from '../window/overlay-window-controller'

export class ForensicsIpc {
  constructor(private readonly ipc: Pick<IpcMain, `handle`>, private readonly http: Pick<HttpClient, `getServer`>,
    private readonly window: Pick<OverlayWindowController, `getCurrent`>) {}

  register(): void {
    for (const operation of [`vectors`, `ping`, `triangulate`] as const) {
      this.ipc.handle(`server:forensics:alt:${operation}`, async (event, playerId: unknown) => {
        if (event.sender !== this.window.getCurrent()?.webContents || !event.senderFrame || event.senderFrame !== event.sender.mainFrame) {
          throw new Error(`Player Forensics is only available in the main SpellBook window.`)
        }
        if (operation !== `vectors` && (typeof playerId !== `number` || !Number.isSafeInteger(playerId) || playerId < 1)) {
          throw new Error(`Choose a valid player.`)
        }
        return await this.http.getServer(operation === `vectors` ? `/forensics/alt/vectors` : `/forensics/alt/players/${playerId}/vectors/${operation}`)
      })
    }
  }
}
