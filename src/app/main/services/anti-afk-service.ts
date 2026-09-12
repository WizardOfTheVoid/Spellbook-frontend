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
  private debugPaused = false
  private pulseTimer: AntiAfkTimer | null = null
  private statusTimer: AntiAfkTimer | null = null
  private pulseInFlight: Promise<void> | null = null
  private pulseCancellation: AbortController | null = null
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

  async setDebugPaused(paused: boolean): Promise<void> {
    this.debugPaused = paused
    if (paused) {
      this.pulseCancellation?.abort()
      this.status.hide()
      await this.pulseInFlight?.catch(() => undefined)
    }
  }

  async setEnabled(enabled: boolean): Promise<AntiAfkState> {
    if (this.enabled === enabled) return this.getState()

    this.enabled = enabled
    if (!enabled) {
      this.pulseCancellation?.abort()
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
    this.pulseCancellation?.abort()
    this.clearTimers()
    this.status.hide()
  }

  private schedulePulse(): void {
    if (!this.enabled || this.debugPaused || this.pulseInFlight) return

    const cancellation = new AbortController()
    this.pulseCancellation = cancellation
    this.pulseInFlight = this.pressConfiguredSequence(cancellation.signal)
      .catch(() => undefined)
      .finally(() => {
        this.pulseInFlight = null
        if (this.pulseCancellation === cancellation) this.pulseCancellation = null
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

  private async pressConfiguredSequence(signal: AbortSignal): Promise<void> {
    if (this.overlayActivity.isOverlayActive() && this.overlayActivity.getInactiveGameCommandResult()) return
    await this.httpClient.executeAction([{
      type: `keys`,
      minimumIdleMs: this.config.minimumMovementIdleMs,
      presses: this.config.presses.map(press => ({ ...press }))
    }], { id: this.requestIds.next(`anti-afk`), author: `system`, priority: `normal`, signal })
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
      !this.debugPaused &&
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
