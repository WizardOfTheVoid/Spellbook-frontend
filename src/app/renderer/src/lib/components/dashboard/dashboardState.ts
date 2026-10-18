import { dashboardQueryKey, defaultDashboardQuery, type DashboardDataSource, type DashboardViewModel, type DashboardViewQuery } from './dashboardViewModel'

export type DashboardViewState = Readonly<{ query: DashboardViewQuery, data: DashboardViewModel | null, loading: boolean, error: string | null, secondsUntilRefresh: number | null }>
export type DashboardClock = Readonly<{ now: () => number, setTimeout: (callback: () => void, delay: number) => unknown, clearTimeout: (id: unknown) => void }>

export function createDashboardState(input: Readonly<{ source: Pick<DashboardDataSource, `load`>, onChange: (value: DashboardViewState) => void, query?: DashboardViewQuery, clock?: DashboardClock, refreshMs?: number }>) {
  const clock = input.clock ?? { now: Date.now, setTimeout: (run: () => void, delay: number) => globalThis.setTimeout(run, delay), clearTimeout: (id: unknown) => globalThis.clearTimeout(id as ReturnType<typeof setTimeout>) }
  const refreshMs = input.refreshMs ?? 5000
  let state: DashboardViewState = { query: input.query ?? defaultDashboardQuery, data: null, loading: true, error: null, secondsUntilRefresh: null }
  let alive = true
  let started = false
  let visible = true
  let busy = false
  let pending = false
  let revision = 0
  let timer: unknown = null
  let refreshAt = 0

  const emit = (changes: Partial<DashboardViewState>) => {
    if (!alive) return
    state = { ...state, ...changes }
    input.onChange(state)
  }
  const clearTimer = () => {
    if (timer !== null) clock.clearTimeout(timer)
    timer = null
  }
  const tick = () => {
    if (!alive || !visible || !started) return
    const remaining = refreshAt - clock.now()
    emit({ secondsUntilRefresh: Math.max(0, Math.ceil(remaining / 1000)) })
    if (remaining <= 0) {
      void load()
      return
    }
    timer = clock.setTimeout(tick, Math.min(1000, remaining))
  }
  const load = async (): Promise<void> => {
    if (!alive || !visible || !started || busy) return
    busy = true
    pending = false
    clearTimer()
    const selected = { ...state.query }
    const requestRevision = revision
    emit({ loading: true, error: null, secondsUntilRefresh: null })
    try {
      const data = await input.source.load(selected)
      if (alive && visible && requestRevision === revision && dashboardQueryKey(data.query) === dashboardQueryKey(state.query)) emit({ data, error: null })
    } catch (caught) {
      if (requestRevision === revision && visible) emit({
        error: caught instanceof Error ? caught.message : `Dashboard unavailable`,
        data: state.data && dashboardQueryKey(state.data.query) === dashboardQueryKey(state.query) ? state.data : null,
      })
    } finally {
      busy = false
      if (alive && visible && started) {
        if (pending) await load()
        else {
          emit({ loading: false })
          refreshAt = clock.now() + refreshMs
          tick()
        }
      }
    }
  }
  return {
    start: async () => {
      if (started || !alive) return
      started = true
      await load()
    },
    refresh: load,
    setQuery: async (query: DashboardViewQuery) => {
      if (!alive || dashboardQueryKey(query) === dashboardQueryKey(state.query)) return
      revision++
      pending = busy
      clearTimer()
      emit({ query: { ...query }, error: null, loading: visible, secondsUntilRefresh: null })
      if (!busy) await load()
    },
    setVisible: (next: boolean) => {
      if (!alive || visible === next) return
      visible = next
      revision++
      clearTimer()
      emit({ loading: false, secondsUntilRefresh: null })
      if (visible) {
        pending = busy
        if (!busy) void load()
      }
    },
    destroy: () => {
      alive = false
      revision++
      pending = false
      clearTimer()
    },
  }
}
