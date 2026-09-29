import { randomUUID } from 'node:crypto'
import type { DashboardPresenceInput } from '@spellbook/shared/dashboard'
import { isInGameServer, type GameState } from '../../shared/gameState'
import type { CurrentGameSnapshotStore } from './currentGameSnapshotStore'

export class GamePresenceReporter {
  private userId: number | null = null
  private sequence = 0
  private running = false
  private pending = false
  private lastServer: number | null | undefined
  private timer: ReturnType<typeof setInterval> | null = null
  private readonly unsubscribe: () => void

  constructor(private readonly snapshots: CurrentGameSnapshotStore, private readonly gameState: () => GameState,
    private readonly report: (input: DashboardPresenceInput) => Promise<unknown>, private readonly now = Date.now,
    private readonly instanceId: string = randomUUID()) {
    this.unsubscribe = snapshots.subscribe(() => this.observe())
  }

  update(userId: number | null): void {
    if (this.userId === userId) return
    this.userId = userId
    this.lastServer = undefined
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    if (userId === null) return
    this.timer = setInterval(() => { void this.pulse() }, 15000)
    this.timer.unref()
    void this.pulse()
  }

  observe(): void { void this.pulse(false) }

  async pulse(heartbeat = true): Promise<void> {
    if (this.userId === null) return
    if (this.running) { this.pending = true; return }
    const snapshot = this.snapshots.get()
    const fresh = snapshot && this.now() - Date.parse(snapshot.observedAt) >= 0 && this.now() - Date.parse(snapshot.observedAt) < 45000
    const gameServerId = isInGameServer(this.gameState()) && fresh ? snapshot.gameServerId : null
    if (!heartbeat && gameServerId === this.lastServer) return
    const userId = this.userId
    const input = { instanceId: this.instanceId, sequence: ++this.sequence,
      gameServerId }
    this.running = true
    try {
      const result = await this.report(input)
      if (this.userId === userId && !(result && typeof result === `object` && `ok` in result && result.ok === false)) this.lastServer = gameServerId
    }
    catch { /* The heartbeat retries without affecting game actions. */ }
    finally {
      this.running = false
      if (this.pending) { this.pending = false; this.observe() }
    }
  }

  destroy(): void {
    this.update(null)
    this.unsubscribe()
  }
}
