import type { ActionClaim, ActionResult, ActionStart } from '@spellbook/shared/actions/actionTypes'
import type { CoreCallResult } from '../../types'
import type { CurrentGameSnapshotStore } from '../currentGameSnapshotStore'
import { ActionRequestError, type ActionClient } from './actionClient'
import type { ActionHandler } from './actionHandler'

type Active = { claim: ActionClaim, coreId: string | null, result: ActionResult | null, execution?: Promise<void>, reporting?: Promise<void> }

export class ActionWorker {
  private timer: ReturnType<typeof setInterval> | null = null
  private active = new Map<number, Active>()
  private polling: Promise<void> | null = null
  private userId: number | null | undefined
  private enabled = false
  private debugPaused = false
  private generation = 0
  constructor(private readonly client: Pick<ActionClient, `poll` | `start` | `report`>, private readonly handler: Pick<ActionHandler, `execute`>,
    private readonly snapshots: Pick<CurrentGameSnapshotStore, `get` | `subscribe`>, private readonly cancel: (id: string) => Promise<unknown>,
    private readonly now = () => Date.now()) {
    snapshots.subscribe(snapshot => {
      for (const active of this.active.values()) {
        if (!snapshot || snapshot.gameServerId !== active.claim.run.gameServerId) void this.cancelActive(active)
      }
    })
  }

  setUser(userId: number | null) { this.userId = userId }

  start() {
    if (this.enabled) return
    this.enabled = true
    this.generation++
    this.timer = setInterval(() => { void this.runNow().catch(error => console.warn(`[Actions]`, error)) }, 4000)
    void this.runNow().catch(error => console.warn(`[Actions]`, error))
  }

  async stop() {
    this.enabled = false
    this.generation++
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    await this.cancelAll()
    await this.polling?.catch(error => console.warn(`[Actions] Stopping poll`, error))
    await this.cancelAll()
    await Promise.all([...this.active.values()].map(active => active.execution))
    await Promise.all([...this.active.values()].filter(active => this.owns(active)).map(active => this.report(active)))
  }

  async setDebugPaused(paused: boolean) {
    this.debugPaused = paused
    if (paused) await this.cancelAll()
  }

  async runNow() {
    if (!this.enabled) return
    if (this.polling) return this.polling
    this.polling = this.tick()
    try { await this.polling } finally { this.polling = null }
  }

  private async tick() {
    const generation = this.generation
    for (const active of this.active.values()) if (active.result && this.owns(active)) void this.report(active)
    const snapshot = this.snapshots.get()
    if (!snapshot || !this.canExecute(snapshot.gameServerId, generation)) {
      await this.cancelAll()
      return
    }
    const response = await this.client.poll({ gameServerId: snapshot.gameServerId,
      active: [...this.active.values()].filter(active => active.coreId && !active.result && this.owns(active))
        .map(({ claim }) => ({ runId: claim.run.id, token: claim.token })) })
    await Promise.all(response.cancel.map(id => this.cancelActive(this.active.get(id))))
    if (!this.canExecute(snapshot.gameServerId, generation)) return
    for (const claim of response.claims) {
      if (this.active.has(claim.run.id)) continue
      const active: Active = { claim, coreId: null, result: null }
      this.active.set(claim.run.id, active)
      active.execution = this.execute(active, generation)
    }
  }

  private async execute(active: Active, generation: number) {
    try {
      const requestedAt = this.now()
      // A lost start response never triggers a second start or native submission.
      const start = await this.client.start(active.claim.run.id, active.claim.token)
      active.coreId = start.coreActionId
      if (!this.canExecute(start.run.gameServerId, generation)) active.result = { status: `cancelled`, sentCommands: 0, code: `CONTEXT_CHANGED` }
      else active.result = await this.executeNative(start, requestedAt)
    } catch (error) {
      if (!active.coreId && error instanceof ActionRequestError && [`DUPLICATE_ACTIVE_BAN`, `DUPLICATE_BAN_COMMAND`].includes(error.code ?? ``)) {
        console.info(`[Actions] Run #${active.claim.run.id} cancelled: ${error.message}`)
      } else if (active.coreId && error instanceof RangeError) active.result = { status: `failed`, sentCommands: 0, code: `PREPARATION_FAILED`, message: error.message }
      else console.warn(`[Actions] Result unavailable; run remains uncertain.`, error)
    } finally {
      if (active.result) await this.report(active)
      else this.active.delete(active.claim.run.id)
    }
  }

  private async executeNative(start: ActionStart, requestedAt: number): Promise<ActionResult | null> {
    const ttlMs = Math.floor(Date.parse(start.expiresAt) - Date.parse(start.serverTime) - (this.now() - requestedAt))
    if (ttlMs <= 0) return { status: `expired`, sentCommands: 0 }
    const { result } = await this.handler.execute(start.recipe, start.run.target, start.context,
      { id: start.coreActionId, ttlMs, author: `system`, priority: start.run.priority })
    return nativeResult(result)
  }

  private async report(active: Active) {
    if (!active.result || !this.owns(active)) return
    if (active.reporting) return active.reporting
    active.reporting = this.deliverResult(active, active.result)
    try { await active.reporting } finally { active.reporting = undefined }
  }

  private async deliverResult(active: Active, result: ActionResult) {
    try {
      await this.client.report(active.claim.run.id, active.claim.token, result)
      this.active.delete(active.claim.run.id)
    } catch (error) { console.warn(`[Actions] Result retained for retry`, error) }
  }

  private owns(active: Active) { return this.userId === undefined || active.claim.run.executorId === this.userId }

  private canExecute(serverId: number, generation: number) {
    const snapshot = this.snapshots.get()
    return this.enabled && !this.debugPaused && generation === this.generation && snapshot?.gameServerId === serverId
      && snapshot.parseWarnings.length === 0 && this.now() - Date.parse(snapshot.observedAt) <= 15000
  }

  private async cancelAll() { await Promise.all([...this.active.values()].map(active => this.cancelActive(active))) }

  private async cancelActive(active?: Active) {
    if (active?.coreId && !active.result) await this.cancel(active.coreId).catch(error => console.warn(`[Actions] Cancellation failed`, error))
  }
}

function nativeResult(result: CoreCallResult): ActionResult | null {
  const envelope = result.data as { data?: { status?: string, sentCommands?: number }, error?: { code?: string, message?: string } } | null
  const data = envelope?.data
  if (!data || !Number.isInteger(data.sentCommands) || ![`completed`, `failed`, `expired`, `cancelled`, `superseded`].includes(data.status ?? ``)) return null
  return { status: data.status as ActionResult[`status`], sentCommands: data.sentCommands!,
    ...(envelope?.error?.code ? { code: envelope.error.code, message: envelope.error.message } : {}) }
}
