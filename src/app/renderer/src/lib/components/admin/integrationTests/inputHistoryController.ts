export type InputConfig = {
  file: string
  sections: Record<string, Record<string, string[]>>
}

type HistoryRow = { index: number, command: string, action: string, info: string }
type State = { rows: HistoryRow[], total: number, loading: boolean, error: string, updatedAt: number | null }

export class InputHistoryController {
  state: State = { rows: [], total: 0, loading: false, error: ``, updatedAt: null }
  private active = false
  private pending = false
  private request = 0
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(
    private readonly readConfig: () => Promise<InputConfig>,
    private readonly onChange: (state: State) => void = () => {}
  ) {}

  setActive(active: boolean): void {
    if (active === this.active) return
    this.active = active
    this.request += 1
    if (this.timer !== null) clearInterval(this.timer)
    this.timer = null
    if (active) {
      void this.load()
      this.timer = setInterval(() => void this.load(), 1000)
    } else {
      this.update({ ...this.state, loading: false })
    }
  }

  private async load(): Promise<void> {
    if (!this.active || this.pending) return
    this.pending = true
    const request = this.request
    this.update({ ...this.state, loading: true })
    try {
      const config = await this.readConfig()
      if (request !== this.request) return
      const history = config.sections[`/Script/TBL.TBLConsole`]?.HistoryBuffer ?? []
      const offset = Math.max(0, history.length - 10)
      const rows = history.slice(offset).map((command, index) => {
        const space = command.search(/\s/u)
        return { index: offset + index + 1, command, action: space < 0 ? command : command.slice(0, space), info: space < 0 ? `` : command.slice(space).trimStart() }
      })
      this.update({ rows, total: history.length, loading: false, error: ``, updatedAt: Date.now() })
    } catch (error) {
      if (request === this.request) this.update({ ...this.state, loading: false, error: error instanceof Error ? error.message : String(error) })
    } finally {
      this.pending = false
    }
  }

  private update(state: State): void {
    this.state = state
    this.onChange(state)
  }
}
