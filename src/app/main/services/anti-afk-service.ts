import type { HttpClient } from '../api/http-client'
import type { FocusStateFactory } from '../focus/focus-state-factory'
import { ValueReader } from '../parsers/value-reader'
import type { RequestIdFactory } from '../request-id-factory'
import type { AntiAfkConfig } from './antiAfkConfig'
import type { OverlayActivityGuard } from './overlay-activity-guard'

const antiAfkStatusMs = 1_000

type AntiAfkTimer = unknown

export type AntiAfkState = {
  enabled: boolean
}

export type AntiAfkScheduler = {
  setInterval: (callback: () => void, intervalMs: number) => AntiAfkTimer
  clearInterval: (timer: AntiAfkTimer) => void
}

export type AntiAfkStatus = {
  show: () => void
  hide: () => void
}

const systemScheduler: AntiAfkScheduler = {
  setInterval: (callback, intervalMs) => setInterval(callback, intervalMs),
  clearInterval: timer => clearInterval(timer as NodeJS.Timeout)
}

export class AntiAfkService {
  private enabled = false
  private pulseTimer: AntiAfkTimer | null = null
  private statusTimer: AntiAfkTimer | null = null
  private pulseInFlight: Promise<void> | null = null
  private statusInFlight: Promise<void> | null = null

  constructor(
    private readonly httpClient: HttpClient,
    private readonly requestIds: RequestIdFactory,
    private readonly focusStates: FocusStateFactory,
    private readonly status: AntiAfkStatus,
    private readonly overlayActivity: OverlayActivityGuard,
    private readonly config: AntiAfkConfig,
    private readonly scheduler: AntiAfkScheduler = systemScheduler
  ) {}

  getState(): AntiAfkState {
    return { enabled: this.enabled }
  }

  async setEnabled(enabled: boolean): Promise<AntiAfkState> {
    if (this.enabled === enabled) return this.getState()

    this.enabled = enabled
    if (!enabled) {
      this.clearTimers()
      this.status.hide()
      return this.getState()
    }

    this.pulseTimer = this.scheduler.setInterval(
      () => this.schedulePulse(),
      this.config.intervalMs
    )
    this.statusTimer = this.scheduler.setInterval(
      () => this.scheduleStatusRefresh(),
      antiAfkStatusMs
    )
    await this.refreshStatus().catch(() => this.status.hide())
    return this.getState()
  }

  stop(): void {
    this.enabled = false
    this.clearTimers()
    this.status.hide()
  }

  private schedulePulse(): void {
    if (!this.enabled || this.pulseInFlight) return

    this.pulseInFlight = this.pressConfiguredSequence()
      .catch(() => undefined)
      .finally(() => {
        this.pulseInFlight = null
      })
  }

  private scheduleStatusRefresh(): void {
    if (!this.enabled || this.statusInFlight) return

    this.statusInFlight = this.refreshStatus()
      .catch(() => this.status.hide())
      .finally(() => {
        this.statusInFlight = null
      })
  }

  private async pressConfiguredSequence(): Promise<void> {
    const path = `/v2/input/sequence`
    const payload = {
      id: this.requestIds.next(`anti-afk`),
      minimumMovementIdleMs: this.config.minimumMovementIdleMs,
      presses: this.config.presses
    }

    if (this.overlayActivity.isOverlayActive()) {
      if (this.overlayActivity.getInactiveGameCommandResult()) return
      await this.httpClient.postCoreInput(path, payload)
      return
    }

    await this.httpClient.callCore(path, {
      method: `POST`,
      body: JSON.stringify(payload)
    })
  }

  private async refreshStatus(): Promise<void> {
    const meta = await this.httpClient.callCore(`/v2/meta/get`, { method: `GET` })
    const gameIsFocused = this.focusStates.create(meta).gameIsFocused
    const data = ValueReader.getEnvelopeData(meta)
    const movement = ValueReader.isRecord(data?.movement) ? data.movement : null
    const movementAvailable = ValueReader.getBoolean(movement, `available`) === true
    const timeSinceMovementMs = movement
      ? ValueReader.getNumber(movement, `timeSinceMovementMs`)
      : null

    if (
      this.enabled &&
      gameIsFocused &&
      movementAvailable &&
      timeSinceMovementMs !== null &&
      timeSinceMovementMs >= this.config.minimumMovementIdleMs
    ) this.status.show()
    else this.status.hide()
  }

  private clearTimers(): void {
    if (this.pulseTimer !== null) this.scheduler.clearInterval(this.pulseTimer)
    if (this.statusTimer !== null) this.scheduler.clearInterval(this.statusTimer)
    this.pulseTimer = null
    this.statusTimer = null
  }
}
