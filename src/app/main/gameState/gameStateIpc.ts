import type { IpcMain } from 'electron'
import type { GameStateService } from './gameStateService'
import type { OverlayWindowController } from '../window/overlay-window-controller'

export class GameStateIpc {
  constructor(private readonly ipc: Pick<IpcMain, `handle`>, private readonly game: GameStateService,
    private readonly window: Pick<OverlayWindowController, `sendToCurrent`>) {}

  register(): void {
    this.ipc.handle(`core:meta`, () => this.game.refresh())
    this.ipc.handle(`core:gameState`, () => this.game.get())
    this.ipc.handle(`core:refreshGameState`, async () => {
      await this.game.refresh()
      return this.game.get()
    })
    this.game.subscribe(state => this.window.sendToCurrent(`core:gameStateChanged`, state))
  }
}
