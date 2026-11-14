import { canFollowActionEvents, createActionEventsQuery, matchesActionEventsStatus, normalizeActionEventsQuery } from './actionEventsQuery'
import type { ActionEvent, ActionEventsQuery, ActionEventsSource, ActionEventsState } from './actionEventsTypes'

type LoadOperation = NonNullable<ActionEventsState[`loading`]>
type FeedOptions = {
  onChange: (state: ActionEventsState) => void
  onInsert?: (items: ActionEvent[]) => void
  onQuiet?: () => void
  state?: ActionEventsState
  now?: () => number
  schedule?: (run: () => void, delayMs: number) => () => void
}

function savedState(state?: ActionEventsState): ActionEventsState | undefined {
  if (!state || typeof state.query.systemOnly !== `boolean`) return
  const query = normalizeActionEventsQuery(createActionEventsQuery(state.query))
  return JSON.stringify(query) === JSON.stringify(state.query) ? { ...state, query } : undefined
}

export class ActionEventsFeed {
  state: ActionEventsState
  private active = false
  private disposed = false
  private interacting = false
  private revision = 0
  private queryRevision = 0
  private request: AbortController | null = null
  private mutations = new Map<number, AbortController>()
  private cancelTimer: (() => void) | null = null
  private failedCancellation: number | null = null
  private readonly now: () => number
  private readonly schedule: NonNullable<FeedOptions[`schedule`]>

  constructor(readonly source: ActionEventsSource, private readonly options: FeedOptions) {
    this.now = options.now ?? Date.now
    this.schedule = options.schedule ?? ((run, delay) => {
      const timer = setTimeout(run, delay)
      return () => clearTimeout(timer)
    })
    const saved = savedState(options.state)
    this.state = saved ? { ...saved, loading: null, pendingIds: [] } : {
      query: createActionEventsQuery(), items: [], nextCursor: null, total: null, mode: `live`,
      loading: null, error: ``, failedOperation: null, refreshedAt: null, pendingIds: []
    }
    if (!canFollowActionEvents(this.state.query, this.now())) this.state.mode = `browsing`
    this.publish()
  }

  async setActive(active: boolean): Promise<void> {
    if (this.disposed || this.active === active) return
    this.active = active
    if (!active) {
      this.invalidateList()
      this.options.onQuiet?.()
      this.publish()
    } else {
      this.closeHistoricalWindow()
      if (this.state.refreshedAt === null) await this.load(`initial`, true)
      else if (this.state.mode === `live`) await this.load(`poll`, true)
      else this.syncTimer()
    }
  }

  async setQuery(query: ActionEventsQuery): Promise<void> {
    if (this.disposed) return
    query = normalizeActionEventsQuery(createActionEventsQuery(query))
    this.invalidateList()
    this.queryRevision++
    this.options.onQuiet?.()
    this.state = { ...this.state, query, items: [], nextCursor: null,
      total: null, mode: canFollowActionEvents(query, this.now()) ? `live` : `browsing`, error: ``, failedOperation: null, refreshedAt: null }
    this.publish()
    if (this.active) await this.load(`initial`, true)
  }

  pause(): void {
    if (this.disposed || this.state.mode === `browsing`) return
    this.invalidateList()
    this.state = { ...this.state, mode: `browsing` }
    this.options.onQuiet?.()
    this.publish()
    this.syncTimer()
  }

  setInteraction(active: boolean): void {
    if (this.disposed || this.interacting === active) return
    this.interacting = active
    if (active) {
      if (this.state.loading && this.state.loading !== `append`) {
        this.invalidateList()
        this.publish()
      }
      this.options.onQuiet?.()
    }
    this.syncTimer()
  }

  restore(state: ActionEventsState): void {
    if (this.disposed) return
    const saved = savedState(state)
    if (!saved) {
      void this.setQuery(typeof state.query.systemOnly === `boolean` ? state.query : createActionEventsQuery())
      return
    }
    this.invalidateList()
    this.queryRevision++
    this.options.onQuiet?.()
    this.state = { ...saved, loading: null, pendingIds: [...this.mutations.keys()] }
    this.closeHistoricalWindow()
    this.publish()
    this.syncTimer()
  }

  async append(): Promise<void> {
    if (!this.active || this.disposed || this.state.loading || !this.state.nextCursor || this.interacting || this.mutations.size) return
    this.pause()
    await this.load(`append`, true)
  }

  async resume(): Promise<void> {
    if (!this.active || this.disposed || this.state.loading || this.interacting || this.mutations.size) return
    await this.load(`resume`, true)
  }

  async retry(): Promise<void> {
    const operation = this.state.failedOperation
    if (operation === `cancel` && this.failedCancellation !== null) await this.cancel(this.failedCancellation)
    else if (operation === `append`) await this.append()
    else if (operation === `resume`) await this.resume()
    else if (operation && operation !== `cancel` && this.active && !this.state.loading) await this.load(operation)
  }

  async cancel(id: number): Promise<void> {
    const current = this.state.items.find(item => item.id === id)
    if (this.disposed || this.mutations.has(id) || !current?.canCancel || ![`pending`, `claimed`].includes(current.status)) return
    if (this.state.loading) this.invalidateList()
    const controller = new AbortController()
    const queryRevision = this.queryRevision
    this.mutations.set(id, controller)
    this.state = { ...this.state, pendingIds: [...this.mutations.keys()], error: ``, failedOperation: null }
    this.options.onQuiet?.()
    this.syncTimer()
    this.publish()
    try {
      const result = await this.source.cancel({ id, signal: controller.signal })
      if (this.disposed || controller.signal.aborted || queryRevision !== this.queryRevision) return
      const updated = this.state.items.map(item => item.id === id ? result : item)
      const items = updated.filter(item => item.id !== id || matchesActionEventsStatus(item.status, this.state.query.status))
      this.state = { ...this.state, items, total: this.state.total === null ? null : Math.max(0, this.state.total - (updated.length - items.length)) }
      if (result.status !== `cancelled`) this.state = { ...this.state, error: `This request can no longer be cancelled.` }
    } catch {
      if (!this.disposed && !controller.signal.aborted && queryRevision === this.queryRevision) {
        this.failedCancellation = id
        this.state = { ...this.state, error: `Could not cancel this request. Please try again.`, failedOperation: `cancel` }
      }
    } finally {
      this.mutations.delete(id)
      if (!this.disposed) {
        this.state = { ...this.state, pendingIds: [...this.mutations.keys()] }
        this.publish()
        this.syncTimer()
      }
    }
  }

  dispose(): void {
    this.disposed = true
    this.invalidateList()
    for (const controller of this.mutations.values()) controller.abort()
    this.mutations.clear()
    this.options.onQuiet?.()
  }

  private async load(operation: LoadOperation, silent = false): Promise<void> {
    if (!this.active || this.disposed || this.request || (operation === `poll` && (this.interacting || this.mutations.size))) return
    if ((operation === `poll` || operation === `resume`) && this.closeHistoricalWindow()) return
    this.stopTimer()
    const controller = new AbortController()
    this.request = controller
    const revision = ++this.revision
    const query = this.state.query
    this.state = { ...this.state, loading: operation, error: ``, failedOperation: null }
    this.publish()
    try {
      const page = await this.source.list({ query, cursor: operation === `append` ? this.state.nextCursor ?? undefined : undefined,
        limit: operation === `append` ? 100 : 30, signal: controller.signal })
      if (!this.current(revision, controller)) return
      const previousIds = new Set(this.state.items.map(item => item.id))
      const unique = new Map(page.items.map(item => [item.id, item]))
      const items = operation === `append` ? [...this.state.items, ...[...unique.values()].filter(item => !previousIds.has(item.id))] : [...unique.values()].slice(0, 30)
      const newest = this.state.items[0]
      const refreshedAt = this.state.refreshedAt
      const inserted = operation === `poll` && !silent && refreshedAt !== null ? items.filter(item => !previousIds.has(item.id)
        && (newest ? item.requestedAt > newest.requestedAt || (item.requestedAt === newest.requestedAt && item.id > newest.id)
          : Date.parse(item.requestedAt) >= refreshedAt)) : []
      this.state = { ...this.state, query, items, nextCursor: page.nextCursor, total: page.total ?? null,
        mode: !canFollowActionEvents(query, this.now()) ? `browsing` : operation === `resume` ? `live` : this.state.mode, refreshedAt: this.now() }
      if (inserted.length && canFollowActionEvents(query, this.now())) this.options.onInsert?.(inserted)
    } catch {
      if (this.current(revision, controller)) this.state = { ...this.state, error: operation === `append`
        ? `Could not load older events. Please try again.` : `Could not refresh events. Please try again.`, failedOperation: operation }
    } finally {
      if (this.current(revision, controller)) {
        this.request = null
        this.state = { ...this.state, loading: null }
        this.publish()
        this.syncTimer()
      }
    }
  }

  private current(revision: number, controller: AbortController): boolean {
    return !this.disposed && !controller.signal.aborted && revision === this.revision
  }

  private invalidateList(): void {
    this.stopTimer()
    this.revision++
    this.request?.abort()
    this.request = null
    this.state = { ...this.state, loading: null }
  }

  private stopTimer(): void {
    this.cancelTimer?.()
    this.cancelTimer = null
  }

  private syncTimer(): void {
    this.stopTimer()
    if (this.closeHistoricalWindow()) return
    if (!this.active || this.disposed) return
    const remaining = this.state.query.until === null ? null : this.state.query.until - this.now()
    if (!this.interacting && !this.mutations.size && this.state.mode === `live` && !this.state.loading) {
      this.cancelTimer = this.schedule(() => {
        this.cancelTimer = null
        void this.load(`poll`)
      }, Math.min(5000, remaining ?? 5000))
    } else if (remaining !== null) {
      this.cancelTimer = this.schedule(() => {
        this.cancelTimer = null
        this.syncTimer()
      }, Math.min(remaining, 86400000))
    }
  }

  private closeHistoricalWindow(): boolean {
    if (canFollowActionEvents(this.state.query, this.now())) return false
    this.stopTimer()
    this.state = { ...this.state, mode: `browsing` }
    this.options.onQuiet?.()
    this.publish()
    return true
  }

  private publish(): void {
    this.options.onChange(this.state)
  }
}
