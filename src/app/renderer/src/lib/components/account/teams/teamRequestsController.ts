import type { TeamJoinRequest } from '../../../core'
import type { TeamOutgoingInvitation, TeamInvitationCancellation } from '@spellbook/shared/notifications'

export type TeamRequestsDependencies = {
  requests: (teamId: number) => Promise<TeamJoinRequest[]>
  invitations: (teamId: number) => Promise<TeamOutgoingInvitation[]>
  decide: (teamId: number, userId: number, decision: `approve` | `reject`) => Promise<void>
  cancel: (teamId: number, invitationId: number) => Promise<TeamInvitationCancellation>
  onChanged: () => Promise<void>
  onIncomingCount?: (teamId: number, count: number, accountId: number) => void
  scheduler: { setInterval: (run: () => void, milliseconds: number) => number, clearInterval: (id: number) => void }
}
export type TeamRequestsState = {
  incoming: TeamJoinRequest[], outgoing: TeamOutgoingInvitation[], hydrated: boolean,
  initialLoading: boolean, refreshing: boolean, busyKeys: string[], error: string | null, mutationError: string | null, notice: string | null
}
const emptyState = (): TeamRequestsState => ({ incoming: [], outgoing: [], hydrated: false, initialLoading: false, refreshing: false, busyKeys: [], error: null, mutationError: null, notice: null })

export class TeamRequestsController {
  state = emptyState()
  private accountId: number | null = null
  private teamId: number | null = null
  private active = false
  private disposed = false
  private generation = 0
  private contextRevision = 0
  private revision = 0
  private timer: number | null = null
  private inFlight: { generation: number, promise: Promise<void> } | null = null

  constructor(private readonly dependencies: TeamRequestsDependencies, private readonly changed: (state: TeamRequestsState) => void = () => {}) {}

  setContext(accountId: number | null, teamId: number | null, active: boolean): void {
    if (this.disposed || this.accountId === accountId && this.teamId === teamId && this.active === active) return
    const sameContext = this.accountId === accountId && this.teamId === teamId
    if (!sameContext) this.contextRevision++
    this.generation++
    if (this.timer !== null) this.dependencies.scheduler.clearInterval(this.timer)
    this.timer = null
    this.accountId = accountId
    this.teamId = teamId
    this.active = active
    this.update(sameContext ? { ...this.state, refreshing: false, initialLoading: false } : emptyState())
    if (this.ready()) this.timer = this.dependencies.scheduler.setInterval(() => {
      if (!this.state.busyKeys.length) void this.refresh()
    }, 8000)
  }

  async refresh(): Promise<void> {
    if (!this.ready() || this.state.busyKeys.length) return
    if (this.inFlight) {
      const old = this.inFlight
      await old.promise
      if (old.generation !== this.generation && this.ready()) await this.refresh()
      return
    }
    const generation = this.generation
    const promise = this.loadSnapshot(generation, this.revision, this.teamId!, this.accountId!)
    const flight = { generation, promise }
    this.inFlight = flight
    try { await promise }
    finally { if (this.inFlight === flight) this.inFlight = null }
  }

  async decide(userId: number, decision: `approve` | `reject`): Promise<void> {
    await this.mutate(`request:${userId}`, async teamId => {
      await this.dependencies.decide(teamId, userId, decision)
      return { incoming: this.state.incoming.filter(request => request.userId !== userId), notice: decision === `approve` ? `Request approved.` : `Request rejected.` }
    })
  }

  async cancel(invitationId: number): Promise<void> {
    await this.mutate(`invitation:${invitationId}`, async teamId => {
      const result = await this.dependencies.cancel(teamId, invitationId)
      return { outgoing: result.status === `pending` ? this.state.outgoing : this.state.outgoing.filter(invitation => invitation.id !== invitationId),
        notice: result.status === `cancelled` ? `Invitation cancelled.` : result.status === `accepted` ? `This invitation was already accepted.`
          : result.status === `declined` ? `This invitation was already declined.` : `This invitation is still awaiting an answer.` }
    })
  }

  destroy(): void {
    this.disposed = true
    this.generation++
    if (this.timer !== null) this.dependencies.scheduler.clearInterval(this.timer)
    this.timer = null
  }

  private async loadSnapshot(generation: number, revision: number, teamId: number, accountId: number): Promise<void> {
    this.update({ ...this.state, initialLoading: !this.state.hydrated, refreshing: this.state.hydrated, error: null })
    const [incoming, outgoing] = await Promise.allSettled([this.dependencies.requests(teamId), this.dependencies.invitations(teamId)])
    if (!this.current(generation)) return
    if (revision !== this.revision) {
      this.update({ ...this.state, initialLoading: false, refreshing: false })
      return
    }
    if (incoming.status === `fulfilled` && outgoing.status === `fulfilled`) {
      this.update({ ...this.state, incoming: incoming.value, outgoing: outgoing.value, hydrated: true, initialLoading: false, refreshing: false, error: null })
      this.dependencies.onIncomingCount?.(teamId, incoming.value.length, accountId)
    } else {
      const error = incoming.status === `rejected` ? incoming.reason : outgoing.status === `rejected` ? outgoing.reason : null
      this.update({ ...this.state, initialLoading: false, refreshing: false, error: error instanceof Error ? error.message : `Requests could not be loaded.` })
    }
  }

  private async mutate(key: string, run: (teamId: number) => Promise<Partial<TeamRequestsState>>): Promise<void> {
    if (!this.ready() || this.state.busyKeys.includes(key)) return
    const contextRevision = this.contextRevision
    this.revision++
    this.update({ ...this.state, busyKeys: [...this.state.busyKeys, key], mutationError: null, notice: null })
    try {
      const change = await run(this.teamId!)
      if (!this.sameMutationContext(contextRevision)) return
      this.update({ ...this.state, ...change })
      await this.dependencies.onChanged()
    } catch (error) {
      if (this.sameMutationContext(contextRevision)) this.update({ ...this.state, mutationError: error instanceof Error ? error.message : `The request could not be updated.` })
    } finally {
      if (this.sameMutationContext(contextRevision)) {
        this.update({ ...this.state, busyKeys: this.state.busyKeys.filter(value => value !== key) })
        if (this.inFlight) await this.inFlight.promise
        if (this.sameMutationContext(contextRevision)) await this.refresh()
      }
    }
  }

  private ready(): boolean { return !this.disposed && this.active && this.accountId !== null && this.teamId !== null }
  private current(generation: number): boolean { return this.ready() && generation === this.generation }
  private sameMutationContext(revision: number): boolean { return !this.disposed && revision === this.contextRevision }
  private update(state: TeamRequestsState): void { this.state = state
    this.changed(state) }
}
