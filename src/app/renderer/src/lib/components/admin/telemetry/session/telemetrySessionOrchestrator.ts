import { writable } from 'svelte/store'
import type { RecordingJob, RecordingStatus, TelemetryApi, WorkerStatus } from '../../../../../../../shared/telemetry/telemetryTypes'
import type { EventFeedFilter, EventFeedTab } from '../events/eventFeedFilters'
import type { TelemetryPreviewState, TelemetrySession, TelemetrySnapshot, TelemetryTab, TelemetryWorkspace } from './telemetryModels'
import { parseTelemetryEndpoint } from './telemetryEndpoint'
import type { TelemetryServerTarget } from './telemetryServerSelection'
import { TelemetryReadScheduler } from './telemetryReadScheduler'
import { TelemetryWorkerSource, type TelemetryReadRequest } from './telemetryWorkerSource'

type WorkspaceId = `live` | `replay`
type FilterState = Record<WorkspaceId, Record<EventFeedTab, EventFeedFilter & { page: number, offsets: number[] }>>
export type TelemetrySessionState = TelemetryPreviewState & {
  snapshots: Record<WorkspaceId, TelemetrySnapshot | null>
  filters: FilterState
  endpoint: string
  endpointOverride: boolean
  selectedServer: TelemetryServerTarget | null
  status: WorkerStatus | null
  busy: boolean
  loading: boolean
  error: string | null
  job: RecordingJob | null
}

const newWorkspace = (): TelemetryWorkspace => ({
  sessionId: null, cursorMs: 0, desiredCursorMs: 0, mode: `paused`, speed: 1, selectedPlayerId: null, tab: `overview`
})
const filters = (): FilterState[WorkspaceId] => ({
  kills: { query: ``, kind: ``, page: 1, offsets: [0] }, combat: { query: ``, kind: ``, page: 1, offsets: [0] }, items: { query: ``, kind: ``, page: 1, offsets: [0] }
})
const sessionFromStatus = (status: RecordingStatus): TelemetrySession => ({
  id: status.id, name: `Recording ${new Date(status.startedAtUtc ?? status.requestedAtUtc).toLocaleString()}`,
  serverName: `${status.endpoint.host}:${status.endpoint.port}`,
  startedAt: Date.parse(status.startedAtUtc ?? status.requestedAtUtc), durationMs: status.head.elapsedUs / 1000,
  status: [`recording`, `starting`, `stopping`].includes(status.state) ? `recording` : `saved`,
  captureState: status.state, decoderVersion: status.decoderVersion
})

export class TelemetrySessionOrchestrator {
  private state: TelemetrySessionState = {
    source: `live`, live: newWorkspace(), replay: newWorkspace(), liveSession: null, recordings: [], headMs: 0,
    snapshots: { live: null, replay: null }, filters: { live: filters(), replay: filters() },
    endpoint: ``, endpointOverride: false, selectedServer: null, status: null, busy: false, loading: false, error: null, job: null
  }
  readonly view = writable(this.state)
  private statuses = new Map<string, RecordingStatus>()
  private connected = false
  private connectionGeneration = 0
  private timer: ReturnType<typeof setTimeout> | null = null
  private subscriptions = new Map<string, () => void>()
  private requestId = 0
  private lastTick = 0
  private lastRead = -Infinity
  private lastDetails = -Infinity
  private lastCatalog = -Infinity
  private lastJobRead = -Infinity
  private pollingJob = false
  private lastRequestedKey = ``
  private retriedReadKey = ``
  private forceDetails = true
  private readonly source: TelemetryWorkerSource
  private readonly scheduler: TelemetryReadScheduler<TelemetryReadRequest, TelemetrySnapshot>

  constructor(private readonly api: () => TelemetryApi, private readonly now = () => Date.now()) {
    this.source = new TelemetryWorkerSource(api)
    this.scheduler = new TelemetryReadScheduler(
      request => this.source.read(request),
      (request, snapshot) => this.commit(request, snapshot),
      (error, request) => this.readFailed(error, request),
      request => this.source.cancel(request)
    )
  }

  workspace(state = this.state) { return state.source === `live` ? state.live : state.replay }
  private workspaceId(): WorkspaceId { return this.state.source === `live` ? `live` : `replay` }
  getSnapshot(state = this.state) { return state.snapshots[state.source === `live` ? `live` : `replay`] }

  connect(): () => void {
    this.connected = true
    this.scheduler.setActive(true)
    this.lastTick = this.now()
    const generation = ++this.connectionGeneration
    void this.reconcile(generation)
    return () => {
      if (!this.connected || generation !== this.connectionGeneration) return
      this.connected = false
      this.connectionGeneration++
      this.scheduler.setActive(false)
      for (const unsubscribe of this.subscriptions.values()) unsubscribe()
      this.subscriptions.clear()
      this.clearTimer()
    }
  }

  setServerAddress(address: string | null) {
    if (this.targetLocked() || this.state.endpointOverride || !parseTelemetryEndpoint(address) || address === this.state.endpoint) return
    this.publish({ endpoint: address!.trim() })
  }

  private targetLocked() { return this.state.busy || this.state.liveSession?.status === `recording` }
  selectServer(selectedServer: TelemetryServerTarget) {
    if (this.targetLocked() || !parseTelemetryEndpoint(selectedServer.address)) return
    this.publish({ selectedServer, endpoint: selectedServer.address, endpointOverride: true })
  }
  setEndpoint(endpoint: string) {
    if (!this.targetLocked()) this.publish({ endpoint, endpointOverride: true, selectedServer: null })
  }
  useCurrentServer(address: string | null) {
    if (this.targetLocked()) return
    this.publish({ endpointOverride: false, endpoint: ``, selectedServer: null })
    this.setServerAddress(address)
  }

  setSource(source: TelemetrySessionState[`source`]) {
    if (source === this.state.source) return
    this.publish({ source })
    this.changed()
  }
  setTab(tab: TelemetryTab) {
    this.updateWorkspace({ tab })
    this.changed()
  }
  selectPlayer(selectedPlayerId: string | null) {
    this.updateWorkspace({ selectedPlayerId, selectedPlayerAnchorId: selectedPlayerId })
    this.resetPages()
    this.changed()
  }
  setFilter(tab: EventFeedTab, filter: EventFeedFilter) {
    const id = this.workspaceId()
    this.publish({ filters: { ...this.state.filters, [id]: { ...this.state.filters[id], [tab]: { ...filter, query: filter.query.slice(0, 128), page: 1, offsets: [0] } } } })
    this.changed()
  }
  setEventPage(tab: EventFeedTab, page: number) {
    const id = this.workspaceId()
    const current = this.state.filters[id][tab]
    const offsets = [...current.offsets]
    const nextOffset = this.getSnapshot()?.eventPage?.nextOffset
    if (page > current.page && typeof nextOffset === `number`) offsets[page - 1] = nextOffset
    if (page < 1 || offsets[page - 1] === undefined) return
    this.publish({ filters: { ...this.state.filters, [id]: { ...this.state.filters[id], [tab]: { ...current, page, offsets } } } })
    this.changed()
  }
  setRosterPage(page: number) {
    const workspace = this.workspace()
    const offsets = [...(workspace.rosterOffsets ?? [0])]
    const nextOffset = this.getSnapshot()?.roster?.nextOffset
    if (page > (workspace.rosterPage ?? 1) && typeof nextOffset === `number`) offsets[page - 1] = nextOffset
    if (page < 1 || offsets[page - 1] === undefined) return
    this.updateWorkspace({ rosterPage: page, rosterOffsets: offsets })
    this.changed()
  }
  seek(timeMs: number, immediate = false) {
    if (!Number.isFinite(timeMs)) return
    this.publish({ error: null })
    this.retriedReadKey = ``
    this.updateWorkspace({ desiredCursorMs: Math.max(0, Math.min(timeMs, this.duration())), mode: `paused` })
    this.resetPages()
    this.lastRequestedKey = ``
    this.scheduler.invalidate()
    this.forceDetails = true
    this.request(immediate)
    this.arm()
  }
  play() {
    if (!this.workspace().sessionId) return
    const cursor = this.workspace().desiredCursorMs ?? this.workspace().cursorMs
    this.updateWorkspace({ mode: `playing`, desiredCursorMs: cursor >= this.duration() ? 0 : cursor })
    this.lastTick = this.now()
    this.changed()
  }
  pause() {
    this.updateWorkspace({ mode: `paused` })
    this.arm()
  }
  goLive() {
    if (this.state.source !== `live` || !this.state.liveSession) return
    this.updateWorkspace({ desiredCursorMs: this.state.headMs, mode: this.state.liveSession.status === `recording` ? `live` : `paused` })
    this.changed()
  }
  setSpeed(speed: number) { if (Number.isFinite(speed) && speed > 0) this.updateWorkspace({ speed }) }

  async startRecording() {
    if (this.targetLocked()) return
    const endpoint = parseTelemetryEndpoint(this.state.endpoint)
    if (!endpoint) {
      this.publish({ error: `Choose a server, join one to detect it, or set an address in Session details.` })
      return
    }
    await this.command(async () => {
      const status = await this.api().startRecording({ endpoint })
      this.acceptStatus(status)
      this.publish({ source: `live`, live: { ...newWorkspace(), sessionId: status.id, mode: `live`, desiredCursorMs: status.head.elapsedUs / 1000 }, snapshots: { ...this.state.snapshots, live: null } })
      this.subscribe()
      this.changed()
    })
  }
  async stopRecording() {
    const id = this.state.liveSession?.id
    if (!id) return
    await this.command(async () => {
      const status = await this.api().stopRecording(id)
      this.acceptStatus(status)
      this.publish({ live: { ...this.state.live, mode: `paused` } })
      if (this.connected) await this.refreshLibrary()
      this.changed()
    })
  }
  openRecording(id: string) {
    if (!this.statuses.has(id)) return
    this.publish({ source: `recordings`, replay: { ...newWorkspace(), sessionId: id }, snapshots: { ...this.state.snapshots, replay: null } })
    this.changed()
  }
  closeRecording() {
    this.publish({ replay: newWorkspace(), snapshots: { ...this.state.snapshots, replay: null } })
    this.changed()
  }
  async importRecording() {
    await this.command(async () => {
      const endpoint = parseTelemetryEndpoint(this.state.endpoint) ?? undefined
      const job = await this.api().importRecording(endpoint ? { endpoint } : undefined)
      if (job) {
        this.publish({ job })
        this.arm()
      }
    })
  }
  async reprocessRecording(id: string) {
    await this.command(async () => {
      this.publish({ job: await this.api().reprocessRecording(id) })
      this.arm()
    })
  }
  async cancelJob() {
    const job = this.state.job
    if (!job) return
    await this.command(async () => {
      this.publish({ job: await this.api().cancelJob(job.id) })
      this.arm()
    })
  }

  private async reconcile(generation: number) {
    try {
      const [status, recordings] = await Promise.all([this.api().getStatus(), this.api().listRecordings()])
      if (!this.connected || generation !== this.connectionGeneration) return
      this.statuses = new Map(recordings.map(recording => [recording.id, recording]))
      this.publish({ status, recordings: recordings.filter(recording => ![`starting`, `recording`, `stopping`].includes(recording.state)).map(sessionFromStatus), error: status.error ?? null })
      if (status.active) this.acceptStatus(status.active)
      else if (this.state.liveSession) {
        const saved = this.statuses.get(this.state.liveSession.id)
        if (saved) this.acceptStatus(saved)
      }
      this.subscribe()
      this.changed()
    } catch (error) {
      if (this.connected && generation === this.connectionGeneration) this.publish({ error: this.message(error) })
    }
  }

  private acceptStatus(status: RecordingStatus) {
    this.statuses.set(status.id, status)
    const existing = this.state.live.sessionId === status.id
    const headMs = status.head.elapsedUs / 1000
    const live = existing ? this.state.live : { ...newWorkspace(), sessionId: status.id, mode: `live` as const }
    const session = sessionFromStatus(status)
    if (this.state.selectedServer?.address === session.serverName) session.serverName = this.state.selectedServer.name
    this.publish({
      headMs, liveSession: session,
      live: { ...live, desiredCursorMs: live.mode === `live` ? headMs : live.desiredCursorMs, mode: session.status === `saved` && live.mode === `live` ? `paused` : live.mode },
      ...(session.status === `saved` ? { recordings: [session, ...this.state.recordings.filter(item => item.id !== session.id)] } : {}),
      ...(status.state === `failed` ? { error: status.stopReason ?? `Capture failed.` } : {})
    })
  }
  private subscribe() {
    const ids = new Set([
      this.state.liveSession?.status === `recording` ? this.state.liveSession.id : null,
      this.workspace().sessionId
    ].filter((id): id is string => !!id))
    for (const [id, unsubscribe] of this.subscriptions) {
      if (this.connected && ids.has(id)) continue
      unsubscribe()
      this.subscriptions.delete(id)
    }
    if (!this.connected) return
    for (const id of ids) {
      if (this.subscriptions.has(id) || !this.statuses.has(id)) continue
      this.subscriptions.set(id, this.api().subscribeUpdates({ recordingId: id }, update => {
        if (!this.connected) return
        const current = this.statuses.get(update.recordingId)
        if (!current || (current.revision === update.revision && current.generation === update.cursor.generation && current.state === update.state)) return
        const metadataChanged = current.generation !== update.cursor.generation ||
          (current.head.sequence === update.committedHead.sequence && current.revision !== update.revision)
        const status = { ...current, head: update.committedHead, revision: update.revision, generation: update.cursor.generation, state: update.state }
        if (update.recordingId === this.state.liveSession?.id) this.acceptStatus(status)
        else this.statuses.set(update.recordingId, status)
        if (this.workspace().sessionId !== update.recordingId) return
        if (metadataChanged) {
          this.lastRequestedKey = ``
          this.forceDetails = true
          this.request(true)
        } else if (this.workspace().mode === `live`) this.request()
        this.arm()
      }, error => { if (this.connected) this.publish({ error }) }))
    }
  }
  private async refreshLibrary() {
    const recordings = await this.api().listRecordings()
    for (const status of recordings) this.statuses.set(status.id, status)
    this.publish({ recordings: recordings.filter(recording => ![`starting`, `recording`, `stopping`].includes(recording.state)).map(sessionFromStatus) })
  }
  private async command(action: () => Promise<void>) {
    if (this.state.busy) return
    this.publish({ busy: true, error: null })
    try { await action() } catch (error) { this.publish({ error: this.message(error) }) }
    finally { this.publish({ busy: false }) }
  }
  private changed() {
    this.subscribe()
    this.scheduler.invalidate()
    this.lastRequestedKey = ``
    this.forceDetails = true
    this.retriedReadKey = ``
    this.request(true)
    this.arm()
  }
  private request(immediate = false) {
    if (!this.connected) return
    const workspace = this.workspace()
    const status = workspace.sessionId ? this.statuses.get(workspace.sessionId) : null
    if (!status) return
    const now = this.now()
    const filter = workspace.tab === `kills` || workspace.tab === `combat` || workspace.tab === `items`
      ? this.state.filters[this.workspaceId()][workspace.tab] : { query: ``, kind: ``, page: 1, offsets: [0] }
    const interval = workspace.mode === `paused` || workspace.tab === `map` ? 100 : filter.query.trim() ? 500 : 200
    if (!immediate && now - this.lastRead < interval) return
    const atUs = Math.round((workspace.desiredCursorMs ?? workspace.cursorMs) * 1000)
    const key = JSON.stringify([workspace.sessionId, atUs, status.generation, workspace.mode === `live` ? status.revision : 0, workspace.selectedPlayerId, workspace.tab, filter, workspace.rosterPage])
    if (key === this.lastRequestedKey) return
    const details = this.forceDetails || now - this.lastDetails >= 500
    const catalog = this.forceDetails || now - this.lastCatalog >= 200
    this.lastRequestedKey = key
    this.lastRead = now
    if (details) this.lastDetails = now
    if (catalog) this.lastCatalog = now
    this.forceDetails = false
    this.publish({ loading: true })
    this.scheduler.enqueue({
      workspaceId: this.workspaceId(), requestId: ++this.requestId, recordingId: status.id,
      revision: status.revision, generation: status.generation, atUs, selectedPlayerId: workspace.selectedPlayerId,
      selectedPlayerAnchorId: workspace.selectedPlayerAnchorId,
      tab: workspace.tab, filter, page: filter.page, details, catalog, rosterPage: workspace.rosterPage ?? 1,
      eventOffset: filter.offsets[filter.page - 1] ?? 0,
      rosterOffset: workspace.rosterOffsets?.[(workspace.rosterPage ?? 1) - 1] ?? 0,
      selectedLifetimeId: this.getSnapshot()?.players.find(player => player.id === workspace.selectedPlayerId)?.lifetimeId
    })
  }
  private commit(request: TelemetryReadRequest, snapshot: TelemetrySnapshot) {
    if (request.workspaceId !== this.workspaceId() || request.recordingId !== this.workspace().sessionId) return
    const workspace = this.state[request.workspaceId]
    this.publish({
      snapshots: { ...this.state.snapshots, [request.workspaceId]: snapshot },
      [request.workspaceId]: { ...workspace, cursorMs: snapshot.timeMs, selectedPlayerId: snapshot.resolvedSelectionId ?? workspace.selectedPlayerId },
      loading: false, error: null
    })
  }
  private readFailed(error: unknown, request: TelemetryReadRequest) {
    const key = JSON.stringify([request.recordingId, request.workspaceId, request.atUs, request.tab, request.selectedPlayerId, request.filter, request.page])
    if (/read.?view|generation|changed during this read|resync/i.test(this.message(error)) && this.retriedReadKey !== key) {
      this.retriedReadKey = key
      this.lastRequestedKey = ``
      this.forceDetails = true
      this.request(true)
      return
    }
    this.publish({ error: this.message(error), loading: false })
  }
  private arm() {
    this.clearTimer()
    if (!this.connected) return
    const moving = this.workspace().mode !== `paused`
    const seeking = (this.workspace().desiredCursorMs ?? 0) !== this.workspace().cursorMs && !this.state.error
    const job = this.state.job && [`queued`, `running`].includes(this.state.job.state)
    if (moving || seeking || job) this.timer = setTimeout(() => this.tick(), job && !moving && !seeking ? 500 : 100)
  }
  private tick() {
    if (!this.connected) return
    const now = this.now()
    const elapsed = Math.max(0, now - this.lastTick)
    this.lastTick = now
    const workspace = this.workspace()
    if (workspace.mode === `playing`) {
      const desiredCursorMs = Math.min(this.duration(), (workspace.desiredCursorMs ?? workspace.cursorMs) + elapsed * workspace.speed)
      this.updateWorkspace({ desiredCursorMs, mode: desiredCursorMs >= this.duration() ? this.state.source === `live` && this.state.liveSession?.status === `recording` ? `live` : `paused` : `playing` })
    }
    this.request()
    if (!this.pollingJob && this.state.job && [`queued`, `running`].includes(this.state.job.state) && now - this.lastJobRead >= 500) {
      this.lastJobRead = now
      void this.pollJob(this.state.job.id, this.connectionGeneration)
    }
    this.arm()
  }
  private async pollJob(id: string, generation: number) {
    this.pollingJob = true
    try {
      const job = await this.api().getJob(id)
      if (!this.connected || generation !== this.connectionGeneration || this.state.job?.id !== id) return
      this.publish({ job, error: job.error ?? this.state.error })
      if (job.state === `completed`) {
        await this.refreshLibrary()
        this.changed()
      }
    } catch (error) { if (this.connected) this.publish({ error: this.message(error) }) }
    finally { this.pollingJob = false }
  }
  private clearTimer() {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }
  private duration() {
    return this.state.source === `live` ? this.state.headMs : (this.statuses.get(this.state.replay.sessionId ?? ``)?.head.elapsedUs ?? 0) / 1000
  }
  private updateWorkspace(update: Partial<TelemetryWorkspace>) {
    const id = this.workspaceId()
    this.publish({ [id]: { ...this.state[id], ...update } })
  }
  private resetPages() {
    const id = this.workspaceId()
    const current = this.state.filters[id]
    this.publish({ filters: { ...this.state.filters, [id]: {
      kills: { ...current.kills, page: 1, offsets: [0] }, combat: { ...current.combat, page: 1, offsets: [0] }, items: { ...current.items, page: 1, offsets: [0] }
    } } })
  }
  private publish(update: Partial<TelemetrySessionState>) {
    this.state = { ...this.state, ...update }
    this.view.set(this.state)
  }
  private message(error: unknown) { return error instanceof Error ? error.message : String(error) }
}

let session: TelemetrySessionOrchestrator | null = null
export function getTelemetrySession() {
  return session ??= new TelemetrySessionOrchestrator(() => {
    if (!window.chivTelemetry) throw new Error(`Telemetry is available in the SpellBook desktop app.`)
    return window.chivTelemetry
  })
}
