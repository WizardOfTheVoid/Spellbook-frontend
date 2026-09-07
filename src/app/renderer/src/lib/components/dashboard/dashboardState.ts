import { getDashboard } from '$lib/utils/dashboardApi'
import { createDashboardPresentation } from './dashboardPresentation'

export type DashboardViewState = Readonly<{
  loading: boolean
  error: string | null
  data: ReturnType<typeof createDashboardPresentation> | null
  secondsUntilRefresh: number | null
}>

type DashboardClock = Readonly<{
  now: () => number
  setTimeout: (callback: () => void, delay: number) => unknown
  clearTimeout: (id: unknown) => void
}>

const defaultClock: DashboardClock = {
  now: Date.now,
  setTimeout: (callback, delay) => globalThis.setTimeout(callback, delay),
  clearTimeout: id => globalThis.clearTimeout(id as ReturnType<typeof setTimeout>),
}

export function createDashboardController(input: Readonly<{
  request?: typeof getDashboard
  present?: typeof createDashboardPresentation
  clock?: DashboardClock
  refreshMs?: number
  onChange: (state: DashboardViewState) => void
}>) {
  const request = input.request ?? getDashboard
  const present = input.present ?? createDashboardPresentation
  const clock = input.clock ?? defaultClock
  const refreshMs = input.refreshMs ?? 20_000
  let active = true
  let loading = false
  let timer: unknown = null
  let refreshAt: number | null = null
  let state: DashboardViewState = { loading: true, error: null, data: null, secondsUntilRefresh: null }

  const emit = (next: DashboardViewState): void => {
    if (!active) return
    state = next
    input.onChange(state)
  }

  const clearRefresh = () => {
    if (timer !== null) clock.clearTimeout(timer)
    timer = null
    refreshAt = null
  }

  const scheduleTick = () => {
    if (!active || refreshAt === null) return
    const remaining = refreshAt - clock.now()
    if (remaining <= 0) {
      void load()
      return
    }
    timer = clock.setTimeout(() => {
      timer = null
      if (refreshAt === null) return
      const secondsUntilRefresh = Math.max(0, Math.ceil((refreshAt - clock.now()) / 1000))
      emit({ ...state, secondsUntilRefresh })
      scheduleTick()
    }, Math.min(1_000, remaining))
  }

  const scheduleRefresh = () => {
    refreshAt = clock.now() + refreshMs
    emit({ ...state, secondsUntilRefresh: Math.ceil(refreshMs / 1000) })
    scheduleTick()
  }

  const load = async (): Promise<void> => {
    if (loading || !active) return
    loading = true
    clearRefresh()
    emit({ ...state, loading: true, error: null, secondsUntilRefresh: null })
    try {
      const data = present(await request())
      emit({ loading: false, error: null, data, secondsUntilRefresh: null })
    } catch (caught) {
      const error = caught instanceof Error ? caught.message : `Dashboard request failed.`
      emit({ ...state, loading: false, error, secondsUntilRefresh: null })
    } finally {
      loading = false
      if (active) scheduleRefresh()
    }
  }

  const start = (): void => {
    void load()
  }

  const destroy = (): void => {
    active = false
    clearRefresh()
  }

  return { start, load, destroy }
}
