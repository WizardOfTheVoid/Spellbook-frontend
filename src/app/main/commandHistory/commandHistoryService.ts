import { initialCommandHistoryState, type CommandHistoryState, type ConsoleSubmission, type CommandHistoryRow, type CommandReportingState } from '../../shared/commandHistory/commandHistory'
import { createHash } from 'node:crypto'
import type { CoreCallResult } from '../types'
import { CommandHistoryMatcher } from './commandHistoryMatcher'
import { IncompatibleCommandHistoryError, readInputHistory, readSubmittedCommands } from './commandHistoryResponses'

type Dependencies = {
  getBinding?: () => ObservationBinding | null
  callCore(path: string, init: RequestInit): Promise<CoreCallResult>
  game: { get(): { available: boolean, running: boolean }, subscribe(listener: () => void): () => void }
  appProcessId: number
  utcNow?: () => number
  monotonicNow?: () => number
  setTimeout?: (run: () => void, delay: number) => unknown
  clearTimeout?: (timer: unknown) => void
}

export type ObservationBinding = { clientId: string, gameServerId: number, generation: number, authEpoch: number }
export type CommandObservationFrame = { context: string, rows: readonly {
  key: string, row: CommandHistoryRow, binding: ObservationBinding | Omit<ObservationBinding, `authEpoch`> | null,
  followingCommands: readonly string[]
}[] }

export class CommandHistoryService {
  private state = initialCommandHistoryState
  private readonly listeners = new Set<(state: CommandHistoryState) => void>()
  private readonly observationListeners = new Set<(frame: CommandObservationFrame) => void>()
  private readonly bindings = new Map<number, ObservationBinding | null>()
  private bindingContext = ``
  private readonly utcNow: () => number
  private readonly now: () => number
  private readonly schedule: (run: () => void, delay: number) => unknown
  private readonly clearTimer: (timer: unknown) => void
  private readonly matcher: CommandHistoryMatcher
  private enabled = false
  private active = false
  private userId: number | null = null
  private generation = 0
  private timer: unknown = null
  private controller: AbortController | null = null
  private pending = false
  private unsubscribe: (() => void) | null = null
  private streamKey = ``
  private streamId = ``
  private cursor = 0
  private needsBaseline = true
  private receipts: { receipt: ConsoleSubmission, receivedAt: number }[] = []
  private readonly retired = new Set<string>()
  private evidenceLost = false
  private previousClock: { utc: number, mono: number } | null = null

  constructor(private readonly dependencies: Dependencies) {
    this.utcNow = dependencies.utcNow ?? Date.now
    this.now = dependencies.monotonicNow ?? (() => performance.now())
    this.schedule = dependencies.setTimeout ?? ((run, delay) => setTimeout(run, delay))
    this.clearTimer = dependencies.clearTimeout ?? (timer => clearTimeout(timer as ReturnType<typeof setTimeout>))
    this.matcher = new CommandHistoryMatcher(this.now, command => this.evidenceLost || this.retired.has(this.fingerprint(command)))
  }

  getState(): CommandHistoryState { return this.state }

  subscribeObservations(listener: (frame: CommandObservationFrame) => void): () => void {
    this.observationListeners.add(listener)
    return () => { this.observationListeners.delete(listener) }
  }

  setReporting(reporting: CommandReportingState): void { this.publish({ reporting }) }

  private observations(frame: CommandObservationFrame): void {
    for (const listener of this.observationListeners) listener(frame)
  }

  subscribe(listener: (state: CommandHistoryState) => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  setUser(userId: number | null): void {
    if (this.userId === userId) return
    this.userId = userId
    this.cancel()
    this.clearHistory()
    this.publish({ ...initialCommandHistoryState })
    this.observeGame()
  }

  start(): void {
    if (this.enabled) return
    this.enabled = true
    this.unsubscribe = this.dependencies.game.subscribe(() => this.observeGame())
    this.observeGame()
  }

  stop(): void {
    this.enabled = false
    this.unsubscribe?.()
    this.unsubscribe = null
    this.cancel()
    this.clearHistory()
    this.publish({ ...initialCommandHistoryState })
  }

  private observeGame(): void {
    const game = this.dependencies.game.get()
    const eligible = this.enabled && this.userId !== null && game.available && game.running
    if (!eligible) {
      if (this.active) { this.cancel(); this.clearHistory() }
      this.publish({ ...initialCommandHistoryState, status: this.enabled && this.userId !== null ? `waiting` : `inactive` })
    } else if (!this.active) {
      this.active = true
      const generation = ++this.generation
      void this.poll(generation)
    }
  }

  private cancel(): void {
    this.active = false
    this.generation++
    if (this.timer !== null) this.clearTimer(this.timer)
    this.timer = null
    this.controller?.abort()
  }

  private clearHistory(): void {
    this.bindings.clear()
    this.bindingContext = ``
    this.observations({ context: ``, rows: [] })
    this.matcher.reset()
    this.receipts = []
    this.cursor = 0
    this.streamKey = ``
    this.streamId = ``
    this.needsBaseline = true
    this.previousClock = null
    this.retired.clear()
    this.evidenceLost = false
  }

  private fingerprint(command: string): string { return createHash(`sha256`).update(command).digest(`hex`) }

  private retainReceipts(): void {
    const fresh: typeof this.receipts = []
    const retire = (item: typeof this.receipts[number]) => {
      if (this.evidenceLost || this.matcher.wasMatched(item.receipt.sequence)) return
      const key = this.fingerprint(item.receipt.command)
      if (this.retired.size >= 1024 && !this.retired.has(key)) {
        this.evidenceLost = true
        this.retired.clear()
      } else this.retired.add(key)
    }
    for (const item of this.receipts) {
      if (item.receipt.ageMs + this.now() - item.receivedAt > 30_000) retire(item)
      else fresh.push(item)
    }
    if (fresh.length > 1024) fresh.splice(0, fresh.length - 1024).forEach(retire)
    this.receipts = fresh
  }

  private current(generation: number): boolean { return this.active && this.enabled && generation === this.generation }

  private async read(path: string, controller: AbortController): Promise<CoreCallResult> {
    const timeout = this.schedule(() => controller.abort(), 3_000)
    try {
      const result = await this.dependencies.callCore(path, { method: `GET`, signal: controller.signal })
      if (controller.signal.aborted) throw new Error(`Core command-history read timed out or was cancelled.`)
      return result
    } finally { this.clearTimer(timeout) }
  }

  private async poll(generation: number): Promise<void> {
    if (!this.current(generation)) return
    if (this.pending) { this.scheduleNext(generation); return }
    this.pending = true
    const controller = new AbortController()
    this.controller = controller
    try {
      const start = { utc: this.utcNow(), mono: this.now() }
      const binding = this.dependencies.getBinding?.() ?? null
      const context = JSON.stringify(binding)
      if (context !== this.bindingContext) this.needsBaseline = true
      const clockChanged = this.previousClock && Math.abs(start.utc - this.previousClock.utc - (start.mono - this.previousClock.mono)) > 1_000
      this.previousClock = start
      if (clockChanged) {
        this.needsBaseline = true
        this.publish({ resetReason: `The system clock changed; establishing a new baseline.` })
      }
      const history = readInputHistory(await this.read(`/chivalry2/input/`, controller))
      const completed = { utc: this.utcNow(), mono: this.now() }
      if (Math.abs(completed.utc - start.utc - (completed.mono - start.mono)) > 1_000) this.needsBaseline = true
      if (!this.current(generation)) return
      let submissions = readSubmittedCommands(await this.read(`/v3/commands?after=${this.cursor}`, controller), this.cursor)
      if (this.streamId && submissions.streamId !== this.streamId && this.cursor > 0) {
        submissions = readSubmittedCommands(await this.read(`/v3/commands?after=0`, controller), 0)
      }
      if (!this.current(generation)) return
      if (!submissions.game) throw new Error(`Core has no current game identity.`)
      if (context !== JSON.stringify(this.dependencies.getBinding?.() ?? null)) {
        this.needsBaseline = true
        this.observations({ context: ``, rows: [] })
        return
      }
      const key = `${submissions.streamId}:${submissions.game.processId}:${submissions.game.windowHandle}`
      const baseline = this.needsBaseline || key !== this.streamKey || submissions.eventsLost
      if (baseline) {
        this.bindings.clear()
        this.matcher.reset()
        if (key !== this.streamKey) {
          this.receipts = []
          this.retired.clear()
          this.evidenceLost = false
        }
      }
      if (submissions.eventsLost) this.evidenceLost = true
      const receivedAt = this.now()
      this.receipts.push(...submissions.commands.filter(receipt => receipt.appProcessId === this.dependencies.appProcessId &&
        receipt.gameProcessId === submissions.game!.processId).map(receipt => ({ receipt, receivedAt })))
      this.retainReceipts()
      const rows = this.matcher.accept({ history, readStartedAtUtc: start.utc, readCompletedAtUtc: completed.utc },
        this.receipts.map(item => ({ ...item.receipt, ageMs: item.receipt.ageMs + this.now() - item.receivedAt })))
      const reason = submissions.eventsLost ? `Submission history was lost; established an Unknown baseline.`
        : key !== this.streamKey ? `Core/game identity established a new Unknown baseline.` : ``
      this.streamKey = key
      this.streamId = submissions.streamId
      this.cursor = submissions.sequence
      this.needsBaseline = false
      this.bindingContext = context
      const retained = new Set(rows.map(row => row.id))
      for (const id of this.bindings.keys()) if (!retained.has(id)) this.bindings.delete(id)
      for (const row of rows) if (!this.bindings.has(row.id)) this.bindings.set(row.id, row.observedAtUtc === null ? null : binding)
      this.observations({ context, rows: this.matcher.recoveryReason ? [] : rows.map((row, index) => ({
        key: `${key}:${row.id}`, row, binding: this.bindings.get(row.id) ?? null,
        followingCommands: rows.slice(index + 1).map(next => next.command)
      })) })
      this.publish({ rows: rows.slice(-10), total: rows.length,
        status: this.matcher.recoveryReason ? `recovering` : `monitoring`, error: ``,
        updatedAtUtc: this.matcher.recoveryReason ? this.state.updatedAtUtc : completed.utc,
        resetReason: this.matcher.recoveryReason || (this.evidenceLost
          ? `Submission evidence was lost; unmatched origins remain Unknown until the game/Core session changes.` : reason) })
    } catch (error) {
      if (this.current(generation)) {
        this.observations({ context: ``, rows: [] })
        this.needsBaseline = true
        this.publish({ status: error instanceof IncompatibleCommandHistoryError ? `incompatible` : `unavailable`,
          error: error instanceof Error ? error.message : String(error), resetReason: `Monitoring coverage was interrupted.` })
      }
    } finally {
      this.pending = false
      if (this.controller === controller) this.controller = null
      if (this.current(generation)) this.scheduleNext(generation)
    }
  }

  private scheduleNext(generation: number): void {
    if (this.timer !== null) this.clearTimer(this.timer)
    this.timer = this.schedule(() => { this.timer = null; void this.poll(generation) }, 1_000)
  }

  private publish(patch: Partial<CommandHistoryState>): void {
    this.state = { ...this.state, ...patch, revision: this.state.revision + 1 }
    this.listeners.forEach(listener => listener(this.state))
  }
}
