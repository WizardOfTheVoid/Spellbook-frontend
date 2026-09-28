import type { RulesetDebugSnapshot } from '@spellbook/shared/rulesets/ruleDiagnostics'
import type { DebugTimers } from './debugActionRuns'

export type DebugRulesetState = { snapshot: RulesetDebugSnapshot | null, receivedAt: number, error: string | null }

export class DebugRulesetStream {
  private timer: unknown = null
  private generation = 0
  constructor(private readonly fetch: () => Promise<RulesetDebugSnapshot | null>, private readonly timers: DebugTimers,
    private readonly now: () => number, private readonly publish: (state: DebugRulesetState) => void) {}

  setEnabled(enabled: boolean) {
    const generation = ++this.generation
    if (this.timer !== null) this.timers.clearTimeout(this.timer)
    this.timer = null
    this.publish({ snapshot: null, receivedAt: this.now(), error: null })
    if (enabled) void this.refresh(generation)
  }

  private async refresh(generation: number) {
    try {
      const snapshot = await this.fetch()
      if (generation === this.generation) this.publish({ snapshot, receivedAt: this.now(), error: null })
    } catch (error) {
      if (generation === this.generation) this.publish({ snapshot: null, receivedAt: this.now(), error: error instanceof Error ? error.message : String(error) })
    } finally {
      if (generation === this.generation) this.timer = this.timers.setTimeout(() => { void this.refresh(generation) }, 1000)
    }
  }
}
