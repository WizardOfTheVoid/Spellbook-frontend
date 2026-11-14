import type { AuditLogRecord } from '../../../core'

export type UserActivityState = { records: AuditLogRecord[], loading: boolean, error: string | null }

export class UserActivityController {
  state: UserActivityState = { records: [], loading: false, error: null }
  private accountId: number | null = null
  private userId: number | null = null
  private active = false
  private generation = 0
  private disposed = false

  constructor(private readonly load: (userId: number) => Promise<AuditLogRecord[]>, private readonly changed: (state: UserActivityState) => void = () => {}) {}

  setContext(accountId: number | null, userId: number | null, active: boolean): void {
    if (this.disposed || this.accountId === accountId && this.userId === userId && this.active === active) return
    const sameUser = this.accountId === accountId && this.userId === userId
    this.generation++
    this.accountId = accountId
    this.userId = userId
    this.active = active
    this.update({ records: sameUser ? this.state.records : [], loading: false, error: null })
  }

  async refresh(): Promise<void> {
    if (this.disposed || !this.active || !this.accountId || !this.userId || this.state.loading) return
    const generation = this.generation
    this.update({ ...this.state, loading: true, error: null })
    try {
      const records = await this.load(this.userId)
      if (generation === this.generation && !this.disposed) this.update({ records: records.slice(0, 10), loading: false, error: null })
    } catch (error) {
      if (generation === this.generation && !this.disposed) this.update({ ...this.state, loading: false, error: error instanceof Error ? error.message : `Activity could not be loaded.` })
    }
  }

  destroy(): void { this.generation++
    this.disposed = true }
  private update(state: UserActivityState): void { this.state = state
    this.changed(state) }
}
