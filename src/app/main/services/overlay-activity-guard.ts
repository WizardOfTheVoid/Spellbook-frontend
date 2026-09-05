import type { CoreCallResult } from '../types'
import type { OverlayWindowController } from '../window/overlay-window-controller'

/**
 * Guards IPC actions that would make Core focus or type into the game.
 * Inactive overlays receive a normal CoreCallResult-shaped failure so renderer handling stays uniform.
 */
export class OverlayActivityGuard {
  private gameCommandBatchActive = false
  private textInputActive = false

  constructor(private readonly overlayWindow: OverlayWindowController) {}

  isOverlayActive(): boolean {
    return this.overlayWindow.isForegroundInteractive()
  }

  setTextInputActive(active: boolean): void {
    this.textInputActive = active
  }

  beginGameCommandBatch(): CoreCallResult | null {
    if (!this.isOverlayActive()) {
      return this.overlayInactiveResult()
    }

    if (this.gameCommandBatchActive) {
      return this.commandBatchActiveResult()
    }

    if (this.textInputActive) {
      return this.textInputActiveResult()
    }

    this.gameCommandBatchActive = true
    return null
  }

  endGameCommandBatch(): void {
    this.gameCommandBatchActive = false
  }

  isGameCommandBatchActive(): boolean {
    return this.gameCommandBatchActive
  }

  getInactiveGameCommandResult(): CoreCallResult | null {
    if (this.gameCommandBatchActive) {
      return this.commandBatchActiveResult()
    }

    if (this.textInputActive) {
      return this.textInputActiveResult()
    }

    if (this.isOverlayActive()) {
      return null
    }

    return this.overlayInactiveResult()
  }

  private commandBatchActiveResult(): CoreCallResult {
    return {
      ok: false,
      status: 409,
      statusText: 'COMMAND_BATCH_ACTIVE',
      data: null,
      error: {
        code: 'COMMAND_BATCH_ACTIVE',
        message: 'A profile command batch is already running.'
      }
    }
  }

  private textInputActiveResult(): CoreCallResult {
    return {
      ok: false,
      status: 409,
      statusText: `TEXT_INPUT_ACTIVE`,
      data: null,
      error: {
        code: `TEXT_INPUT_ACTIVE`,
        message: `Finish editing before sending game commands.`
      }
    }
  }

  private overlayInactiveResult(): CoreCallResult {
    return {
      ok: false,
      status: 409,
      statusText: 'OVERLAY_INACTIVE',
      data: null,
      error: {
        code: 'OVERLAY_INACTIVE',
        message: 'Overlay must be visible and focused before sending game commands.'
      }
    }
  }
}
