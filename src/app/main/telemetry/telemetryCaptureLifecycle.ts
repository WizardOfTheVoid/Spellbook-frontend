import { initialGameState, isInGameServer, type GameState } from '../../shared/gameState'
import type { Endpoint } from '../../shared/telemetry/telemetryTypes'

export class TelemetryCaptureLifecycle {
  private state = initialGameState
  private address: string | null = null
  private observedRunning = false

  observe(state: GameState, address: string | null) {
    this.state = state
    this.address = address
    this.observedRunning ||= state.available && state.running
  }

  begin() {
    this.observedRunning = this.state.available && this.state.running
  }

  reasonToStop(endpoint: Endpoint): `gameExited` | `serverChanged` | null {
    if (this.state.available && !this.state.running && this.observedRunning) return `gameExited`
    if (isInGameServer(this.state) && this.address && this.address !== `${endpoint.host}:${endpoint.port}`) return `serverChanged`
    return null
  }
}
