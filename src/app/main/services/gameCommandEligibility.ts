import type { HttpClient } from '../api/http-client'
import { ValueReader } from '../parsers/value-reader'
import type { OverlayWindowController } from '../window/overlay-window-controller'
import type { SentinelService } from './sentinelService'

export type GameCommandDecision =
  | Readonly<{ kind: `interactive` }>
  | Readonly<{ kind: `hidden-idle` }>
  | Readonly<{ kind: `sentinel` }>
  | Readonly<{
      kind: `defer`
      reason: `movement` | `chatting` | `game-unfocused` | `unavailable`
    }>

export class GameCommandEligibility {
  constructor(
    private readonly overlayWindow: Pick<OverlayWindowController, `isVisible`>,
    private readonly http: Pick<HttpClient, `callCore`>,
    private readonly sentinel: Pick<SentinelService, `getState`>
  ) {}

  async check(): Promise<GameCommandDecision> {
    if (this.sentinel.getState().enabled) return { kind: `sentinel` }
    if (this.overlayWindow.isVisible()) return { kind: `interactive` }

    try {
      const result = await this.http.callCore(`/v2/meta/get`, { method: `GET` })
      if (!result.ok) return { kind: `defer`, reason: `unavailable` }

      const data = ValueReader.getEnvelopeData(result)
      const focus = ValueReader.isRecord(data?.focus) ? data.focus : null
      const movement = ValueReader.isRecord(data?.movement) ? data.movement : null
      const gameIsFocused = ValueReader.getBoolean(focus, `gameIsFocused`)
      const available = ValueReader.getBoolean(movement, `available`)
      const isMoving = ValueReader.getBoolean(movement, `isMoving`)
      const isChatting = ValueReader.getBoolean(movement, `isChatting`)

      if (available !== true || isMoving === null || isChatting === null || gameIsFocused === null) {
        return { kind: `defer`, reason: `unavailable` }
      }
      if (!gameIsFocused) return { kind: `defer`, reason: `game-unfocused` }
      if (isChatting) return { kind: `defer`, reason: `chatting` }
      if (isMoving) return { kind: `defer`, reason: `movement` }
      return { kind: `hidden-idle` }
    } catch {
      return { kind: `defer`, reason: `unavailable` }
    }
  }
}
