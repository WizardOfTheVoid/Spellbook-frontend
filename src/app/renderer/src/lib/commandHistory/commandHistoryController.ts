import { initialCommandHistoryState, type CommandHistoryApi, type CommandHistoryState } from '../../../../shared/commandHistory/commandHistory'

export class CommandHistoryController {
  state = initialCommandHistoryState
  error = ``
  private active = false
  private generation = 0
  private unsubscribe: (() => void) | null = null

  constructor(private readonly api: CommandHistoryApi,
    private readonly onChange: (state: CommandHistoryState, error: string) => void = () => {}) {}

  setActive(active: boolean): void {
    if (active === this.active) return
    this.active = active
    const generation = ++this.generation
    this.unsubscribe?.()
    this.unsubscribe = null
    if (!active) return
    try {
      this.unsubscribe = this.api.onCommandHistoryChanged(state => this.receive(state, generation))
      void this.load(generation)
    } catch (error) { this.fail(error, generation) }
  }

  private async load(generation: number): Promise<void> {
    try { this.receive(await this.api.commandHistory(), generation) }
    catch (error) { this.fail(error, generation) }
  }

  private receive(state: CommandHistoryState, generation: number): void {
    if (!this.active || generation !== this.generation || state.revision < this.state.revision) return
    this.state = state
    this.error = ``
    this.onChange(this.state, this.error)
  }

  private fail(error: unknown, generation: number): void {
    if (!this.active || generation !== this.generation) return
    this.error = error instanceof Error ? error.message : String(error)
    this.onChange(this.state, this.error)
  }
}
