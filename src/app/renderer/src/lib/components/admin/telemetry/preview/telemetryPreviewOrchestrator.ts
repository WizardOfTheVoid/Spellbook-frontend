import { writable } from 'svelte/store'
import type {
  TelemetryPreviewState, TelemetrySession, TelemetrySnapshot, TelemetryTab, TelemetryWorkspace
} from '../session/telemetryModels'
import { createPreviewRecordings, TelemetryFixtureSource } from './telemetryFixtures'

export { aggregateItemEvents, playerLabel, selectEvents } from './telemetrySelectors'

const maxDurationMs = 300_000
const newWorkspace = (): TelemetryWorkspace => ({
  sessionId: null, cursorMs: 0, mode: `paused`, speed: 1, selectedPlayerId: null, tab: `overview`
})

export class TelemetryPreviewOrchestrator {
  private state: TelemetryPreviewState = {
    source: `live`,
    live: newWorkspace(),
    replay: newWorkspace(),
    liveSession: null,
    recordings: createPreviewRecordings(),
    headMs: 0
  }
  readonly view = writable(this.state)
  private readonly fixture = new TelemetryFixtureSource()
  private timer: ReturnType<typeof setInterval> | null = null
  private connections = 0
  private lastTickMs: number | null = null
  private sessionNumber = 0

  constructor(private readonly now = () => Date.now()) {}

  workspace(state = this.state): TelemetryWorkspace {
    return state.source === `live` ? state.live : state.replay
  }

  getSnapshot(state = this.state): TelemetrySnapshot | null {
    const workspace = this.workspace(state)
    if (!workspace.sessionId) return null
    return this.fixture.getSnapshot(workspace.sessionId, workspace.cursorMs)
  }

  connect(): () => void {
    if (this.connections++ === 0) {
      this.tick()
      this.timer = setInterval(() => this.tick(), 100)
    }
    let connected = true
    return () => {
      if (!connected) return
      connected = false
      if (--this.connections > 0) return
      this.tick()
      if (this.timer) clearInterval(this.timer)
      this.timer = null
    }
  }

  setSource(source: TelemetryPreviewState[`source`]) {
    this.publish({ ...this.state, source })
  }

  setTab(tab: TelemetryTab) {
    this.updateWorkspace({ tab })
  }

  selectPlayer(selectedPlayerId: string | null) {
    this.updateWorkspace({ selectedPlayerId })
  }

  seek(timeMs: number) {
    if (!Number.isFinite(timeMs)) return
    this.updateWorkspace({ cursorMs: Math.max(0, Math.min(timeMs, this.duration())), mode: `paused` })
  }

  play() {
    if (!this.workspace().sessionId) return
    const cursorMs = this.workspace().cursorMs >= this.duration() ? 0 : this.workspace().cursorMs
    this.updateWorkspace({ cursorMs, mode: `playing` })
  }

  pause() {
    this.updateWorkspace({ mode: `paused` })
  }

  goLive() {
    if (this.state.source !== `live` || !this.state.liveSession) return
    this.updateWorkspace({
      cursorMs: this.state.headMs,
      mode: this.state.liveSession.status === `recording` ? `live` : `paused`
    })
  }

  setSpeed(speed: number) {
    if (!Number.isFinite(speed) || speed <= 0) return
    this.updateWorkspace({ speed })
  }

  startRecording() {
    if (this.state.liveSession?.status === `recording`) {
      this.setSource(`live`)
      return
    }
    const startedAt = this.now()
    const session: TelemetrySession = {
      id: `preview-${startedAt}-${++this.sessionNumber}`,
      name: `Courtyard capture ${this.sessionNumber}`,
      serverName: `SpellBook preview server`,
      startedAt,
      durationMs: 0,
      status: `recording`
    }
    this.lastTickMs = startedAt
    this.publish({
      ...this.state,
      source: `live`,
      headMs: 0,
      liveSession: session,
      live: { ...newWorkspace(), sessionId: session.id, mode: `live` }
    })
  }

  stopRecording() {
    if (this.state.liveSession?.status !== `recording`) return
    const session: TelemetrySession = { ...this.state.liveSession, status: `saved` }
    this.publish({
      ...this.state,
      liveSession: session,
      live: { ...this.state.live, mode: `paused` },
      recordings: [session, ...this.state.recordings]
    })
  }

  openRecording(id: string) {
    if (!this.state.recordings.some(session => session.id === id)) return
    this.publish({
      ...this.state,
      source: `recordings`,
      replay: { ...newWorkspace(), sessionId: id }
    })
  }

  closeRecording() {
    this.publish({ ...this.state, replay: newWorkspace() })
  }

  advance(elapsedMs: number) {
    if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return
    const recording = this.state.liveSession?.status === `recording`
    if (!recording && this.state.live.mode !== `playing` && this.state.replay.mode !== `playing`) return
    const headMs = recording ? Math.min(maxDurationMs, this.state.headMs + elapsedMs) : this.state.headMs
    const liveSession = this.state.liveSession
      ? { ...this.state.liveSession, durationMs: headMs }
      : null
    const live = { ...this.state.live }
    const replay = { ...this.state.replay }
    if (live.mode === `live`) live.cursorMs = headMs
    if (live.mode === `playing`) {
      live.cursorMs = Math.min(headMs, live.cursorMs + elapsedMs * live.speed)
      if (live.cursorMs >= headMs) live.mode = recording ? `live` : `paused`
    }
    const replayDuration = this.state.recordings.find(session => session.id === replay.sessionId)?.durationMs ?? 0
    if (replay.mode === `playing`) {
      replay.cursorMs = Math.min(replayDuration, replay.cursorMs + elapsedMs * replay.speed)
      if (replay.cursorMs >= replayDuration) replay.mode = `paused`
    }
    this.publish({ ...this.state, liveSession, live, replay, headMs })
    if (recording && headMs >= maxDurationMs) this.stopRecording()
  }

  private duration() {
    return this.state.source === `live`
      ? this.state.headMs
      : this.state.recordings.find(session => session.id === this.state.replay.sessionId)?.durationMs ?? 0
  }

  private updateWorkspace(update: Partial<TelemetryWorkspace>) {
    const key = this.state.source === `live` ? `live` : `replay`
    this.publish({ ...this.state, [key]: { ...this.state[key], ...update } })
  }

  private publish(state: TelemetryPreviewState) {
    this.state = state
    this.view.set(state)
  }

  private tick() {
    const now = this.now()
    const elapsedMs = this.lastTickMs === null ? 0 : now - this.lastTickMs
    this.lastTickMs = now
    this.advance(elapsedMs)
  }
}

let preview: TelemetryPreviewOrchestrator | null = null

export function getTelemetryPreview() {
  return preview ??= new TelemetryPreviewOrchestrator()
}
