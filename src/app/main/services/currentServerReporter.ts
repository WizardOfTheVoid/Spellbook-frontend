import type { CurrentServerConnection } from '@spellbook/shared/serverStore'
import type { CurrentGameSnapshotStore } from './currentGameSnapshotStore'
import { isInGameServer, type GameState } from '../../shared/gameState'

export class CurrentServerReporter {
  private userId: number | null = null
  private sequence = 0
  private timer?: ReturnType<typeof setInterval>
  private lastBinding = ``
  private readonly unsubscribe: () => void

  constructor(private readonly snapshots: CurrentGameSnapshotStore, private readonly gameState: () => GameState,
    private readonly clientId: string, private readonly report: (input: CurrentServerConnection) => Promise<unknown>) {
    this.unsubscribe = snapshots.subscribe(() => this.observe())
  }

  update(userId: number | null) {
    if (userId === this.userId) return
    if (this.timer) clearInterval(this.timer)
    this.userId = userId
    this.lastBinding = ``
    if (userId === null) return
    this.timer = setInterval(() => this.observe(true), 15_000)
    this.timer.unref()
    this.observe(true)
  }

  observe(heartbeat = false) {
    if (this.userId === null) return
    const snapshot = this.snapshots.get()
    const gameServerId = isInGameServer(this.gameState()) && snapshot ? snapshot.gameServerId : null
    const generation = this.snapshots.invalidationVersion
    const binding = `${generation}:${gameServerId}`
    if (!heartbeat && binding === this.lastBinding) return
    this.lastBinding = binding
    const input = { clientId: this.clientId, sequence: ++this.sequence, generation, gameServerId }
    void this.report(input).catch(() => { /* The next heartbeat retries. */ })
  }

  destroy() {
    this.update(null)
    this.unsubscribe()
  }
}
