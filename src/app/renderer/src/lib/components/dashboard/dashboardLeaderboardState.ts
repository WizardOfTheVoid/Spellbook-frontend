import type { DashboardDataSource, DashboardLeaderboardPage, DashboardRankingKind } from './dashboardViewModel'

export type DashboardLeaderboardState = Readonly<{ data: DashboardLeaderboardPage | null, loading: boolean, error: string | null }>
export function createDashboardLeaderboardState(input: { kind: DashboardRankingKind, source: Pick<DashboardDataSource, `loadLeaderboard`>, onChange: (state: DashboardLeaderboardState) => void }) {
  let state: DashboardLeaderboardState = { data: null, loading: true, error: null }
  let alive = true
  let revision = 0
  const emit = (changes: Partial<DashboardLeaderboardState>) => {
    if (!alive) return
    state = { ...state, ...changes }
    input.onChange(state)
  }
  const load = async (page: number, asOf: string | null) => {
    const current = ++revision
    emit({ loading: true, error: null })
    try {
      const data = await input.source.loadLeaderboard({ kind: input.kind, page, pageSize: 10, asOf })
      if (alive && current === revision) emit({ data, loading: false })
    } catch (caught) {
      if (current === revision) emit({ loading: false, error: caught instanceof Error ? caught.message : `Ranking unavailable` })
    }
  }
  return {
    start: async () => { if (alive) await load(1, null) },
    setPage: async (page: number) => {
      if (!alive || !state.data || !Number.isInteger(page) || page < 1 || page > Math.ceil(state.data.total / state.data.pageSize)) return
      await load(page, state.data.asOf)
    },
    refresh: async () => { if (alive) await load(1, null) },
    destroy: () => {
      alive = false
      revision++
    },
  }
}
