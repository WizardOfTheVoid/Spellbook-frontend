import type { HttpClient } from '../api/http-client'
import { ValueReader } from '../parsers/value-reader'
import type { CoreCallResult } from '../types'
import type { GameActivitySnapshot } from '../../shared/gameActivity'

type DebugDisplay = {
  setEnabled(enabled: boolean): void
  update(activity: GameActivitySnapshot | null): void
}

type DebugScheduler = {
  setTimeout(callback: () => void, milliseconds: number): unknown
  clearTimeout(timer: unknown): void
}

const scheduler: DebugScheduler = {
  setTimeout: (callback, milliseconds) => setTimeout(callback, milliseconds),
  clearTimeout: timer => clearTimeout(timer as NodeJS.Timeout)
}

export class DebugActivityService {
  private enabled = false
  private generation = 0
  private timer: unknown = null
  private inFlight = false

  constructor(
    private readonly http: Pick<HttpClient, `callCore`>,
    private readonly display: DebugDisplay,
    private readonly timers: DebugScheduler = scheduler
  ) {}

  setEnabled(enabled: boolean): void {
    this.display.setEnabled(enabled)
    if (this.enabled === enabled) return
    this.enabled = enabled
    const generation = ++this.generation
    if (this.timer !== null) this.timers.clearTimeout(this.timer)
    this.timer = null
    this.display.update(null)
    if (enabled) void this.refresh(generation)
  }

  private async refresh(generation: number): Promise<void> {
    if (!this.enabled || generation !== this.generation) return
    if (this.inFlight) {
      this.schedule(generation)
      return
    }
    this.inFlight = true
    try {
      const result = await this.http.callCore(`/v2/meta/get`, { method: `GET` })
      if (this.enabled && generation === this.generation) this.display.update(readActivity(result))
    } catch {
      if (this.enabled && generation === this.generation) this.display.update(null)
    } finally {
      this.inFlight = false
      if (this.enabled && generation === this.generation) this.schedule(generation)
    }
  }

  private schedule(generation: number): void {
    this.timer = this.timers.setTimeout(() => {
      this.timer = null
      void this.refresh(generation)
    }, 250)
  }
}

function readActivity(result: CoreCallResult): GameActivitySnapshot | null {
  if (!result.ok) return null
  const data = ValueReader.getEnvelopeData(result)
  const movement = ValueReader.isRecord(data?.movement) ? data.movement : null
  if (!movement) return null
  const available = ValueReader.getBoolean(movement, `available`)
  const isMoving = ValueReader.getBoolean(movement, `isMoving`)
  const isChatting = ValueReader.getBoolean(movement, `isChatting`)
  const timeSinceMovementMs = ValueReader.getNumber(movement, `timeSinceMovementMs`)
  const timeSinceChattingMs = ValueReader.getNumber(movement, `timeSinceChattingMs`)
  const chatCooldownRemainingMs = ValueReader.getNumber(movement, `chatCooldownRemainingMs`)
  if (available !== true || isMoving === null || isChatting === null ||
    timeSinceMovementMs === null || chatCooldownRemainingMs === null) return null
  return { available, isMoving, isChatting, timeSinceMovementMs, timeSinceChattingMs, chatCooldownRemainingMs }
}
