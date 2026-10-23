import type { OverlayWindowController } from '../window/overlay-window-controller'
import type { SentinelService } from './sentinelService'

export type GameCommandDecision = Readonly<{ kind: `interactive` | `background` | `sentinel` }>

export class GameCommandEligibility {
  constructor(
    private readonly overlayWindow: Pick<OverlayWindowController, `isVisible`>,
    private readonly sentinel: Pick<SentinelService, `getState`>
  ) {}

  async check(): Promise<GameCommandDecision> {
    if (this.sentinel.getState().enabled) return { kind: `sentinel` }
    return { kind: this.overlayWindow.isVisible() ? `interactive` : `background` }
  }
}
