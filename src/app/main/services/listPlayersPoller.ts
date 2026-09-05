import type { CoreCallResult } from '../types'
import type { CurrentGameSnapshotStore } from './currentGameSnapshotStore'
import type { ListPlayersService } from './list-players-service'
import type { GameActivityConfig } from './gameActivityConfig'
import type { GameCommandEligibility } from './gameCommandEligibility'
import type { SentinelService } from './sentinelService'
import type { WantedRuntimeConfig } from './wantedRuntimeConfig'

type Timer = unknown

export type ListPlayersScheduler = {
  setTimeout(callback: () => void, delayMs: number): Timer
  clearTimeout(timer: Timer): void
}

const systemScheduler: ListPlayersScheduler = {
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: timer => clearTimeout(timer as NodeJS.Timeout)
}

type ListPlayersCadence = Pick<
  WantedRuntimeConfig,
  `listPlayersPollMs` | `listPlayersSentinelPollMs`
>

export class ListPlayersPoller {
  private active = false
  private generation = 0
  private timer: Timer | null = null
  private inFlight: Promise<CoreCallResult> | null = null
  private nextDelayMs: number | null = null

  constructor(
    private readonly service: ListPlayersService,
    private readonly snapshots: CurrentGameSnapshotStore,
    private readonly sentinel: Pick<SentinelService, `getState` | `subscribe`>,
    private readonly cadence: ListPlayersCadence,
    private readonly eligibility: Pick<GameCommandEligibility, `check`>,
    private readonly activity: GameActivityConfig,
    private readonly scheduler: ListPlayersScheduler = systemScheduler
  ) {
    this.sentinel.subscribe(() => this.reschedule())
  }

  start(): void {
    if (this.active) return

    this.active = true
    const generation = ++this.generation
    void this.run(generation).catch(() => undefined)
  }

  async stop(): Promise<void> {
    this.active = false
    this.generation += 1
    this.nextDelayMs = null
    this.clearTimer()
    await this.inFlight?.catch(() => undefined)
  }

  refreshNow(): Promise<CoreCallResult> {
    if (!this.active) return Promise.reject(new Error(`ListPlayers runtime is not active.`))

    this.clearTimer()
    return this.run(this.generation)
  }

  private run(generation: number): Promise<CoreCallResult> {
    if (this.inFlight) return this.inFlight

    let request!: Promise<CoreCallResult>
    request = (async () => {
      try {
        const decision = await this.eligibility.check()
        if (decision.kind === `defer`) {
          if (decision.reason === `movement`) this.nextDelayMs = this.activity.recheckMs
          return deferredResult(decision.reason)
        }

        const mode = decision.kind === `hidden-idle` ? `background` : `interactive`
        const refreshed = await this.service.refresh(mode)
        if (this.active && generation === this.generation && refreshed.candidate) {
          this.snapshots.replace(refreshed.candidate)
        }
        return refreshed.result
      } finally {
        if (this.inFlight === request) this.inFlight = null
        if (this.active && generation === this.generation) this.schedule(generation)
      }
    })()
    this.inFlight = request
    return request
  }

  private reschedule(): void {
    if (!this.active) return
    this.clearTimer()
    if (!this.inFlight) this.schedule(this.generation)
  }

  private schedule(generation: number): void {
    this.clearTimer()
    const delayMs = this.nextDelayMs ?? (this.sentinel.getState().enabled
      ? this.cadence.listPlayersSentinelPollMs
      : this.cadence.listPlayersPollMs)
    this.nextDelayMs = null
    this.timer = this.scheduler.setTimeout(() => {
      this.timer = null
      if (!this.active || generation !== this.generation) return
      void this.run(generation).catch(() => undefined)
    }, delayMs)
  }

  private clearTimer(): void {
    if (this.timer !== null) this.scheduler.clearTimeout(this.timer)
    this.timer = null
  }
}

function deferredResult(reason: string): CoreCallResult {
  return {
    ok: true,
    status: 200,
    statusText: `DEFERRED`,
    data: { ok: true, data: { executed: false, reason } }
  }
}
