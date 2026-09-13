import type { AntiAfkState } from './anti-afk-service'

export type SentinelState = Readonly<{ enabled: boolean }>

type AntiAfkControl = {
  setEnabled(enabled: boolean): Promise<AntiAfkState>
}

type SentinelListener = (state: SentinelState) => void

export class SentinelService {
  private state: SentinelState = Object.freeze({ enabled: false })
  private readonly listeners = new Set<SentinelListener>()
  private transitionTail = Promise.resolve()

  constructor(private readonly antiAfk: AntiAfkControl) {}

  getState(): SentinelState {
    return this.state
  }

  setEnabled(enabled: boolean): Promise<SentinelState> {
    const transition = this.transitionTail.then(() => this.apply(enabled))
    this.transitionTail = transition.then(() => undefined, () => undefined)
    return transition
  }

  subscribe(listener: SentinelListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private async apply(enabled: boolean): Promise<SentinelState> {
    if (this.state.enabled === enabled) return this.state
    if (enabled) await this.antiAfk.setEnabled(false)

    this.state = Object.freeze({ enabled })
    for (const listener of this.listeners) listener(this.state)
    return this.state
  }
}
