import type { MaintenanceState, MaintenanceStatus } from '@spellbook/shared/maintenance'
import { readMaintenanceState, type MaintenanceRuntimeState } from '../../shared/maintenance'

type MonitorOptions = {
  read(signal: AbortSignal): Promise<MaintenanceStatus>
  cached?: MaintenanceState | null
  save?(state: MaintenanceState): Promise<void>
  intervalMs?: number
}

export class MaintenanceMonitor {
  private state: MaintenanceRuntimeState
  private listeners = new Set<(state: MaintenanceRuntimeState) => void>()
  private generation = 0
  private pending: Promise<MaintenanceRuntimeState> | null = null
  private controller: AbortController | null = null
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(private readonly options: MonitorOptions) {
    this.state = { maintenance: options.cached ?? null, databaseReady: false, initialized: options.cached?.enabled === true, error: null }
  }

  snapshot(): MaintenanceRuntimeState { return structuredClone(this.state) }

  restoreCached(state: MaintenanceState | null): void {
    if (state && !this.state.initialized) this.publish({ maintenance: state, databaseReady: false, initialized: state.enabled, error: null })
  }

  subscribe(listener: (state: MaintenanceRuntimeState) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  start(): void {
    if (this.timer) return
    void this.refresh()
    this.timer = setInterval(() => { void this.refresh() }, this.options.intervalMs ?? 5_000)
    this.timer.unref?.()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.invalidate()
  }

  refresh(): Promise<MaintenanceRuntimeState> {
    if (this.pending) return this.pending
    const generation = this.generation
    const controller = new AbortController()
    this.controller = controller
    const pending = this.poll(generation, AbortSignal.any([controller.signal, AbortSignal.timeout(2_000)]))
    this.pending = pending
    void pending.finally(() => {
      if (this.pending === pending) { this.pending = null; this.controller = null }
    })
    return pending
  }

  async acceptSaved(state: MaintenanceState): Promise<void> {
    const snapshot = readMaintenanceState(state)
    if (!snapshot) throw new Error(`Invalid maintenance status.`)
    this.invalidate()
    this.publish({ maintenance: snapshot, initialized: true, databaseReady: true, error: null })
    await this.persist(snapshot)
  }

  private invalidate(): void {
    this.generation += 1
    this.controller?.abort()
    this.controller = null
    this.pending = null
  }

  private async poll(generation: number, signal: AbortSignal): Promise<MaintenanceRuntimeState> {
    try {
      const status = await this.options.read(signal)
      if (generation === this.generation && !signal.aborted) {
        // An unavailable database cannot establish that a previously active mode ended.
        const maintenance = !status.databaseReady && this.state.maintenance?.enabled
          ? this.state.maintenance : status.maintenance ?? this.state.maintenance
        const initialized = this.state.initialized || maintenance?.enabled === true || status.databaseReady && status.maintenance !== null
        this.publish({ ...status, maintenance, initialized, error: null })
        if (maintenance) await this.persist(maintenance)
      }
    } catch (error) {
      if (generation === this.generation) this.publish({ ...this.state, error: error instanceof Error ? error.message : `Server unavailable` })
    }
    return this.snapshot()
  }

  private async persist(state: MaintenanceState): Promise<void> {
    try { await this.options.save?.(state) }
    catch (error) { console.warn(`Could not save maintenance status.`, error) }
  }

  private publish(state: MaintenanceRuntimeState): void {
    this.state = structuredClone(state)
    for (const listener of this.listeners) listener(this.snapshot())
  }
}
