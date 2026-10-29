import type { AdminUserRecord } from '../../../core'

export type UserListState = { users: AdminUserRecord[], loading: boolean, loaded: boolean, error: string | null }

export class UserListController {
  state: UserListState = { users: [], loading: false, loaded: false, error: null }
  private generation = 0
  private disposed = false
  constructor(private readonly load: (limit: number, offset: number) => Promise<AdminUserRecord[]>, private readonly changed: (state: UserListState) => void = () => {}) {}

  async refresh(): Promise<void> {
    if (this.disposed || this.state.loading) return
    const generation = ++this.generation
    this.update({ ...this.state, loading: true, error: null })
    try {
      const users = new Map<number, AdminUserRecord>()
      for (let offset = 0; ; offset += 200) {
        const batch = await this.load(200, offset)
        if (this.disposed || generation !== this.generation) return
        for (const user of batch) users.set(user.id, user)
        if (batch.length < 200) break
      }
      this.update({ users: [...users.values()], loading: false, loaded: true, error: null })
    } catch (error) {
      if (!this.disposed && generation === this.generation) this.update({ ...this.state, loading: false, error: error instanceof Error ? error.message : `Users could not be loaded.` })
    }
  }

  destroy(): void { this.generation++
    this.disposed = true }
  private update(state: UserListState): void { this.state = state
    this.changed(state) }
}
