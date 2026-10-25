import type { ActionRun } from '@spellbook/shared/actions/actionTypes'

export type ActionRunDetail = ActionRun & { recipe: unknown, context: unknown, spans: unknown }
export type ActionRunsPage = {
  paused: boolean
  runs: ActionRunDetail[]
  meta: { currentPage: number, pageSize: number, totalPages: number, totalResults: number, hasPrevious: boolean, hasNext: boolean }
}
type State = ActionRunsPage & { loading: boolean, error: string }

export class ActionRunsController {
  state: State = {
    paused: false, runs: [], loading: false, error: ``,
    meta: { currentPage: 1, pageSize: 50, totalPages: 0, totalResults: 0, hasPrevious: false, hasNext: false }
  }
  private request = 0

  constructor(
    private readonly fetchPage: (query: Record<string, string>) => Promise<ActionRunsPage>,
    private readonly onChange: (state: State) => void = () => {}
  ) {}

  async load(filters: Record<string, string>, page = 1): Promise<void> {
    const request = ++this.request
    this.update({ ...this.state, loading: true, error: `` })
    try {
      const result = await this.fetchPage({ ...filters, page: String(page) })
      if (request === this.request) this.update({ ...result, loading: false, error: `` })
    } catch (error) {
      if (request === this.request) this.update({ ...this.state, loading: false, error: error instanceof Error ? error.message : String(error) })
    }
  }

  cancel(): void { this.request += 1 }

  private update(state: State): void {
    this.state = state
    this.onChange(state)
  }
}
