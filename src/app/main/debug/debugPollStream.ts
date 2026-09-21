import type { CoreDebugSnapshot } from '../../shared/debug'
import type { CoreCallResult } from '../types'
import type { DebugTimers } from './debugActionRuns'
import { readDebugSnapshot } from './debugSnapshot'

export type DebugPollRevision = { arm: number, settings: number }
type Dependencies = {
  callCore(path: string, init?: RequestInit): Promise<CoreCallResult>
  cursor(): number
  revision(): DebugPollRevision
  timers: DebugTimers
  intervalMs: number
  receive(core: CoreDebugSnapshot, revision: DebugPollRevision, isCurrent: () => boolean): Promise<void>
  unavailable(error: unknown): Promise<void>
}

export class DebugPollStream {
  private enabled = false
  private generation = 0
  private timer: unknown = null
  private controller: AbortController | null = null
  private polling = false

  constructor(private readonly dependencies: Dependencies) {}

  async setEnabled(enabled: boolean): Promise<void> {
    this.enabled = enabled
    const generation = ++this.generation
    if (this.timer !== null) this.dependencies.timers.clearTimeout(this.timer)
    this.timer = null
    this.controller?.abort()
    if (enabled) await this.refresh(generation)
  }

  private async refresh(generation: number): Promise<void> {
    const isCurrent = () => this.enabled && generation === this.generation
    if (!isCurrent()) return
    if (this.polling) {
      this.schedule(generation)
      return
    }
    this.polling = true
    const controller = new AbortController()
    this.controller = controller
    const revision = this.dependencies.revision()
    try {
      const result = await this.dependencies.callCore(`/v3/debug?after=${this.dependencies.cursor()}`, { method: `GET`, signal: controller.signal })
      if (isCurrent()) await this.dependencies.receive(readDebugSnapshot(result), revision, isCurrent)
    } catch (error) {
      if (isCurrent()) await this.dependencies.unavailable(error)
    } finally {
      this.polling = false
      if (this.controller === controller) this.controller = null
      if (isCurrent()) this.schedule(generation)
    }
  }

  private schedule(generation: number): void {
    if (this.timer !== null) this.dependencies.timers.clearTimeout(this.timer)
    this.timer = this.dependencies.timers.setTimeout(() => {
      this.timer = null
      void this.refresh(generation)
    }, this.dependencies.intervalMs)
  }
}
