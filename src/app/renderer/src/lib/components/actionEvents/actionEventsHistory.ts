import type { ActionEventsState } from './actionEventsTypes'

export class ActionEventsHistory {
  private readonly states = new Map<string, ActionEventsState>()
  private keys = new WeakMap<ActionEventsState, string>()

  clear(): void {
    this.states.clear()
    this.keys = new WeakMap()
  }

  save(state: ActionEventsState): string {
    let key = this.keys.get(state)
    if (!key) {
      key = crypto.randomUUID()
      this.keys.set(state, key)
      this.states.set(key, state)
    }
    return key
  }

  get(key: string): ActionEventsState | undefined {
    return this.states.get(key)
  }
}
