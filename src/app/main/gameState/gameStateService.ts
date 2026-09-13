import { createGameChecks, initialGameState, type GameState } from '../../shared/gameState'
import type { HttpClient } from '../api/http-client'
import { ValueReader } from '../parsers/value-reader'
import type { CoreCallResult, ListPlayersSnapshot } from '../types'
import type { CurrentGameSnapshotInput, CurrentGameSnapshotStore } from '../services/currentGameSnapshotStore'

type Observation = Pick<ListPlayersSnapshot, `serverName` | `serverAddress` | `players`>
type Refresh = { observation?: Observation, candidate?: CurrentGameSnapshotInput }

export class GameStateService {
  private state = initialGameState
  private observation: Observation | null = null
  private observationVersion = 0
  private generation = 0
  private clearing = false
  private timer: ReturnType<typeof setInterval> | null = null
  private pending: Promise<CoreCallResult> | null = null
  private readonly listeners = new Set<(state: GameState) => void>()
  private readonly checks = createGameChecks(() => this.state)
  readonly isGameRunning = this.checks.isGameRunning
  readonly isGameFocused = this.checks.isGameFocused
  readonly isMainMenu = this.checks.isMainMenu
  readonly isInGameServer = this.checks.isInGameServer

  constructor(private readonly http: Pick<HttpClient, `callCore`>, private readonly snapshots: CurrentGameSnapshotStore) {
    snapshots.subscribe(snapshot => {
      if (snapshot || this.clearing) return
      this.observation = null
      this.observationVersion++
      this.publish({ map: null, playerCount: null, connected: false })
    })
  }

  get(): GameState { return this.state }

  subscribe(listener: (state: GameState) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => void this.refresh(), 2_000)
    void this.refresh()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.generation++
    this.pending = null
    this.publish({ available: false })
  }

  async refresh(): Promise<CoreCallResult> {
    if (this.pending) return this.pending
    const request = this.readMeta()
    this.pending = request
    try { return await request }
    finally { if (this.pending === request) this.pending = null }
  }

  observe(next: Observation, revision: number): number | null {
    if (revision !== this.snapshots.invalidationVersion || !this.isGameRunning()) return null
    const previous = this.observation ?? this.snapshots.get()
    const wasMainMenu = this.isMainMenu()
    const changed = previous && (previous.serverAddress && next.serverAddress
      ? previous.serverAddress !== next.serverAddress
      : previous.serverName !== next.serverName)
    this.observation = next
    this.observationVersion++
    this.publish({ map: next.serverName ?? null, playerCount: next.players.length })
    if ((this.isMainMenu() && (!wasMainMenu || this.snapshots.get())) || changed) this.clear()
    return this.snapshots.invalidationVersion
  }

  accept(refreshed: Refresh, revision: number): void {
    if (!refreshed.observation || this.observe(refreshed.observation, revision) === null) return
    if (this.isMainMenu() || !refreshed.candidate) return
    const previous = this.snapshots.get()
    if (previous && previous.externalId !== refreshed.candidate.externalId) this.clear()
    this.snapshots.replace(refreshed.candidate)
    this.publish({ connected: true })
  }

  unavailableResult(): CoreCallResult {
    const code = this.state.available ? `GAME_NOT_RUNNING` : `GAME_STATE_UNAVAILABLE`
    return { ok: false, status: 409, statusText: code, data: null, error: { code,
      message: this.state.available ? `Chivalry 2 is not running.` : `Game status is unavailable. Try again when Core is ready.` } }
  }

  private async readMeta(): Promise<CoreCallResult> {
    const generation = this.generation
    const observationVersion = this.observationVersion
    let result: CoreCallResult
    try {
      result = await this.http.callCore(`/v2/meta/get`, { method: `GET`, signal: AbortSignal.timeout(5_000) })
    } catch {
      result = { ok: false, status: 0, statusText: `CORE_UNAVAILABLE`, data: null }
    }
    if (generation !== this.generation || observationVersion !== this.observationVersion) return result
    const data = ValueReader.getEnvelopeData(result)
    if (!result.ok || !data || (ValueReader.isRecord(result.data) && result.data.ok === false) || typeof data.gameRunning !== `boolean`) {
      this.publish({ available: false })
      return result
    }
    if (!data.gameRunning && (this.state.running || this.observation || this.snapshots.get())) {
      this.observation = null
      this.observationVersion++
      this.clear()
      this.publish({ map: null, playerCount: null })
    }
    this.publish({ available: true, running: data.gameRunning,
      focused: data.gameRunning && ValueReader.isRecord(data.focus) && data.focus.gameIsFocused === true })
    return result
  }

  private clear(): void {
    this.clearing = true
    try { this.snapshots.clear() }
    finally { this.clearing = false }
    this.publish({ connected: false })
  }

  private publish(update: Partial<GameState>): void {
    if (Object.entries(update).every(([key, value]) => this.state[key as keyof GameState] === value)) return
    this.state = Object.freeze({ ...this.state, ...update, version: this.state.version + 1 })
    for (const listener of this.listeners) listener(this.state)
  }
}
