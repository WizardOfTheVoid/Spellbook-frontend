import type { CurrentGameSnapshotStore } from './currentGameSnapshotStore'
import type { ListPlayersPoller } from './listPlayersPoller'
import type { GameActivityConfig } from './gameActivityConfig'
import type { GameCommandEligibility } from './gameCommandEligibility'
import type { WantedCoreExecutor, WantedExecutionMode } from './wantedCoreExecutor'
import type { WantedMessageResolver } from './wantedMessageResolver'
import type { OverlayActivityGuard } from './overlay-activity-guard'
import type { SentinelService } from './sentinelService'
import type { WantedRuntimeConfig } from './wantedRuntimeConfig'
import type { WantedClaim, WantedWork, WantedWorkClient } from './wantedWorkClient'

type Timer = unknown

export type WantedScheduler = {
  setTimeout(callback: () => void, delayMs: number): Timer
  clearTimeout(timer: Timer): void
}

type WantedCadence = Pick<WantedRuntimeConfig, `wantedPollMs` | `wantedSentinelPollMs`>

export type WantedWorkerDependencies = {
  client: Pick<WantedWorkClient, `listWork` | `claim` | `recordAttempt` | `complete` | `fail`>
  resolver: Pick<WantedMessageResolver, `resolve`>
  executor: Pick<WantedCoreExecutor, `execute`>
  snapshots: Pick<CurrentGameSnapshotStore, `get` | `getNewerThan`>
  listPlayers: Pick<ListPlayersPoller, `refreshNow`>
  sentinel: Pick<SentinelService, `getState` | `subscribe`>
  eligibility: Pick<GameCommandEligibility, `check`>
  overlayActivity: Pick<OverlayActivityGuard, `getInactiveGameCommandResult`>
  cadence: WantedCadence
  activity: GameActivityConfig
  scheduler?: WantedScheduler
}

const systemScheduler: WantedScheduler = {
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: timer => clearTimeout(timer as NodeJS.Timeout)
}

const preSubmissionFailure = {
  code: `WANTED_PRE_SUBMISSION_FAILED`,
  message: `Wanted action failed before Core submission.`
} as const

type TargetState =
  | Readonly<{ kind: `ready`, playerName: string }>
  | Readonly<{ kind: `absent` }>
  | Readonly<{ kind: `server-lost` }>

export class WantedWorker {
  private active = false
  private generation = 0
  private timer: Timer | null = null
  private inFlight: Promise<void> | null = null
  private nextDelayMs: number | null = null
  private readonly scheduler: WantedScheduler

  constructor(private readonly dependencies: WantedWorkerDependencies) {
    this.scheduler = dependencies.scheduler ?? systemScheduler
    dependencies.sentinel.subscribe(() => this.reschedule())
  }

  start(): void {
    if (this.active) return
    this.active = true
    const generation = ++this.generation
    void this.run(generation).catch(() => undefined)
  }

  stop(): Promise<void> {
    this.active = false
    this.generation += 1
    this.nextDelayMs = null
    this.clearTimer()
    return this.inFlight?.then(() => undefined, () => undefined) ?? Promise.resolve()
  }

  runNow(): Promise<void> {
    if (!this.active) return Promise.reject(new Error(`Wanted runtime is not active.`))
    this.clearTimer()
    return this.run(this.generation)
  }

  private run(generation: number): Promise<void> {
    if (this.inFlight) return this.inFlight

    let request!: Promise<void>
    request = this.tick(generation).finally(() => {
      if (this.inFlight === request) this.inFlight = null
      if (this.isCurrent(generation)) this.schedule(generation)
    })
    this.inFlight = request
    return request
  }

  private async tick(generation: number): Promise<void> {
    const initial = this.dependencies.snapshots.get()
    if (!initial) return

    let page
    try {
      page = await this.dependencies.client.listWork(initial)
    } catch {
      return
    }
    if (!this.isCurrent(generation)) return

    for (const work of page.work) {
      if (!this.isCurrent(generation)) return
      const target = this.target(work)
      if (target.kind === `server-lost`) return
      if (target.kind === `absent`) continue

      let messages
      try {
        messages = this.dependencies.resolver.resolve(work, page.messageContext, target.playerName)
      } catch {
        return
      }

      const decision = await this.dependencies.eligibility.check()
      if (decision.kind === `defer`) {
        if (decision.reason === `movement`) {
          this.nextDelayMs = this.dependencies.activity.recheckMs
        }
        return
      }

      const mode: WantedExecutionMode = decision.kind === `hidden-idle`
        ? `background`
        : `interactive`
      const inactive = mode === `interactive`
        ? this.dependencies.overlayActivity.getInactiveGameCommandResult()
        : null
      if (inactive || !this.isCurrent(generation)) return

      let claim: WantedClaim | null
      try {
        claim = await this.dependencies.client.claim(work, work.targetServerId)
      } catch {
        return
      }
      if (!claim) continue

      const latest = this.target(work)
      const postClaimInactive = mode === `interactive`
        ? this.dependencies.overlayActivity.getInactiveGameCommandResult()
        : null
      if (!this.isCurrent(generation) || latest.kind !== `ready` || postClaimInactive) {
        await this.bestEffortFail(claim, {
          code: `WANTED_PRECONDITION_LOST`,
          message: `Wanted action eligibility changed before execution.`
        })
        return
      }

      try {
        messages = this.dependencies.resolver.resolve(work, page.messageContext, latest.playerName)
      } catch {
        await this.bestEffortFail(claim, preSubmissionFailure)
        return
      }

      let result
      try {
        result = await this.dependencies.executor.execute(work, messages, mode)
      } catch {
        await this.bestEffortFail(claim, preSubmissionFailure)
        return
      }

      if (!result.ok) {
        await this.bestEffortFail(claim, result.failure)
        return
      }

      try {
        if (work.actionType === `ban`) {
          await this.dependencies.client.recordAttempt(claim, work, messages.automaticReason)
          await this.refreshAndReconcile(initial.version, work.targetServerId)
          return
        }
        await this.dependencies.client.complete(claim, messages.automaticReason)
      } catch {
        return
      }
      if (!this.isCurrent(generation)) return
    }
  }

  private async refreshAndReconcile(previousVersion: number, gameServerId: number): Promise<void> {
    try {
      await this.dependencies.listPlayers.refreshNow()
      const fresh = this.dependencies.snapshots.getNewerThan(previousVersion, gameServerId)
      if (fresh) await this.dependencies.client.listWork(fresh)
    } catch {
      // The normal ListPlayers and Wanted pulses will retry reconciliation.
    }
  }

  private target(work: WantedWork): TargetState {
    const snapshot = this.dependencies.snapshots.get()
    if (!snapshot || snapshot.gameServerId !== work.targetServerId) return { kind: `server-lost` }

    const player = snapshot.players.find(candidate => candidate.playfabId === work.playfabId)
    if (!player && work.actionType !== `unban`) return { kind: `absent` }
    return { kind: `ready`, playerName: player?.name ?? work.playfabId }
  }

  private async bestEffortFail(
    claim: WantedClaim,
    failure?: Readonly<{ code?: string, message?: string }>
  ): Promise<void> {
    try {
      await this.dependencies.client.fail(claim, failure)
    } catch {
      // Claim expiry is the safe fallback when release is unavailable.
    }
  }

  private isCurrent(generation: number): boolean {
    return this.active && generation === this.generation
  }

  private reschedule(): void {
    if (!this.active) return
    this.clearTimer()
    if (!this.inFlight) this.schedule(this.generation)
  }

  private schedule(generation: number): void {
    this.clearTimer()
    const delayMs = this.nextDelayMs ?? (this.dependencies.sentinel.getState().enabled
      ? this.dependencies.cadence.wantedSentinelPollMs
      : this.dependencies.cadence.wantedPollMs)
    this.nextDelayMs = null
    this.timer = this.scheduler.setTimeout(() => {
      this.timer = null
      if (!this.isCurrent(generation)) return
      void this.run(generation).catch(() => undefined)
    }, delayMs)
  }

  private clearTimer(): void {
    if (this.timer !== null) this.scheduler.clearTimeout(this.timer)
    this.timer = null
  }
}
