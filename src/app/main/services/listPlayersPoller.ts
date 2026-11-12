import type { CoreCallResult } from '../types'
import type { CoreActionAuthor, CoreActionPriority } from '../../shared/coreAction'
import type { CurrentGameSnapshotStore } from './currentGameSnapshotStore'
import type { ListPlayersRefresh, ListPlayersService } from './list-players-service'
import type { GameCommandEligibility } from './gameCommandEligibility'
import type { SentinelService } from './sentinelService'
import { actionPriority } from '../core/actionPriority'
import type { PulseConfig } from './pulseConfig'
import type { GameStateService } from '../gameState/gameStateService'

type Timer = unknown

export type ListPlayersScheduler = {
  setTimeout(callback: () => void, delayMs: number): Timer
  clearTimeout(timer: Timer): void
}

const systemScheduler: ListPlayersScheduler = {
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: timer => clearTimeout(timer as NodeJS.Timeout)
}

export class ListPlayersPoller {
  private active = false
  private debugPaused = false
  private generation = 0
  private timer: Timer | null = null
  private inFlight: Promise<ListPlayersRefresh> | null = null
  private cancellation: AbortController | null = null
  private inFlightPriority: CoreActionPriority | null = null

  constructor(
    private readonly service: ListPlayersService,
    private readonly snapshots: CurrentGameSnapshotStore,
    private readonly sentinel: Pick<SentinelService, `getState` | `subscribe`>,
    private readonly cadence: PulseConfig,
    private readonly eligibility: Pick<GameCommandEligibility, `check`>,
    private readonly gameState: Pick<GameStateService, `refresh` | `isGameRunning` | `observe` | `accept` | `unavailableResult`>,
    private readonly scheduler: ListPlayersScheduler = systemScheduler
  ) {
    this.sentinel.subscribe(() => this.reschedule())
  }

  bindOverlay(overlay: { on(event: `show` | `restore`, listener: () => void): unknown }): void {
    const refresh = async () => {
      if (!this.active || this.debugPaused) return
      try { await this.refreshNow(`user`) }
      catch { /* Regular polling retries a failed open refresh. */ }
    }
    overlay.on(`show`, refresh)
    overlay.on(`restore`, refresh)
  }

  start(): void {
    if (this.active) return

    this.active = true
    const generation = ++this.generation
    if (!this.debugPaused) void this.run(generation).catch(() => undefined)
  }

  async stop(): Promise<void> {
    this.active = false
    this.cancellation?.abort()
    this.generation += 1
    this.clearTimer()
    await this.inFlight?.catch(() => undefined)
  }

  async refreshNow(author: CoreActionAuthor = `system`, priority?: CoreActionPriority, signal?: AbortSignal): Promise<CoreCallResult> {
    return (await this.refresh(author, priority, signal)).result
  }

  async refresh(author: CoreActionAuthor = `system`, priority?: CoreActionPriority, signal?: AbortSignal): Promise<ListPlayersRefresh> {
    signal?.throwIfAborted()
    if (!this.active) throw new Error(`ListPlayers runtime is not active.`)
    if (this.debugPaused) throw new Error(`ListPlayers is paused for Debug.`)

    if (priority === `high` && this.inFlight && this.inFlightPriority !== `high`) {
      this.cancellation?.abort()
      await this.inFlight.catch(() => undefined)
      return this.refresh(author, priority, signal)
    }

    this.clearTimer()
    return this.run(this.generation, author, priority, signal)
  }

  async setDebugPaused(paused: boolean): Promise<void> {
    if (this.debugPaused === paused) return
    this.debugPaused = paused
    const generation = ++this.generation
    this.clearTimer()
    if (paused) this.cancellation?.abort()
    await this.inFlight?.catch(() => undefined)
    if (!this.debugPaused && this.active && generation === this.generation) this.schedule(generation)
  }

  private run(generation: number, author: CoreActionAuthor = `system`, priority?: CoreActionPriority, externalSignal?: AbortSignal): Promise<ListPlayersRefresh> {
    if (this.inFlight) return this.inFlight

    const cancellation = new AbortController()
    const signal = externalSignal ? AbortSignal.any([cancellation.signal, externalSignal]) : cancellation.signal
    this.cancellation = cancellation
    this.inFlightPriority = priority ?? null
    let request!: Promise<ListPlayersRefresh>
    request = (async () => {
      try {
        await this.gameState.refresh()
        if (!this.active || this.debugPaused || generation !== this.generation || signal.aborted) {
          return { result: { ok: false, status: 499, statusText: `ACTION_CANCELLED`, data: null } }
        }
        if (!this.gameState.isGameRunning()) return { result: this.gameState.unavailableResult() }
        let revision = this.snapshots.invalidationVersion
        const decision = await this.eligibility.check()
        const effectivePriority = priority ?? actionPriority(`listPlayers`, [], decision.kind === `sentinel` || this.sentinel.getState().enabled)
        this.inFlightPriority = effectivePriority
        const refreshed = await this.service.refresh(decision.kind, signal, snapshot => {
          if (!this.active || this.debugPaused || generation !== this.generation || signal.aborted) return false
          const observed = this.gameState.observe(snapshot, revision)
          if (observed === null) return false
          revision = observed
          return true
        }, author, effectivePriority)
        if (this.active && !this.debugPaused && generation === this.generation && !signal.aborted) {
          this.gameState.accept(refreshed, revision)
        }
        return refreshed
      } finally {
        if (this.inFlight === request) {
          this.inFlight = null
          this.inFlightPriority = null
        }
        if (this.cancellation === cancellation) this.cancellation = null
        if (this.active && generation === this.generation) this.schedule(generation)
      }
    })()
    this.inFlight = request
    return request
  }

  private reschedule(): void {
    if (!this.active || this.debugPaused) return
    this.clearTimer()
    if (!this.inFlight) this.schedule(this.generation)
  }

  private schedule(generation: number): void {
    this.clearTimer()
    if (!this.active || this.debugPaused) return
    const sentinelEnabled = this.sentinel.getState().enabled
    const delayMs = this.cadence.getPulseMs(actionPriority(`listPlayers`, [], sentinelEnabled), sentinelEnabled)
    this.timer = this.scheduler.setTimeout(() => {
      this.timer = null
      if (!this.active || this.debugPaused || generation !== this.generation) return
      void this.run(generation).catch(() => undefined)
    }, delayMs)
  }

  private clearTimer(): void {
    if (this.timer !== null) this.scheduler.clearTimeout(this.timer)
    this.timer = null
  }
}
