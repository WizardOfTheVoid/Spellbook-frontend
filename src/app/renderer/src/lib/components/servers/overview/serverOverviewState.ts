import type { GameServerOverview, ServerAdmins, ServerHistoryPeriod } from '@spellbook/shared/gameServerOverview'

export type ServerOverviewState = {
  data: GameServerOverview | null
  loading: boolean
  error: string | null
  adminsLoading: boolean
  adminsError: string | null
}
type Source = {
  overview(id: number, period: ServerHistoryPeriod): Promise<GameServerOverview>
  admins(id: number, offset: number): Promise<ServerAdmins>
}

export function createServerOverviewState(source: Source, changed: (state: ServerOverviewState) => void) {
  let id = 0
  let period: ServerHistoryPeriod = `day`
  let active = false
  let generation = 0
  let adminOffset = 0
  let state: ServerOverviewState = { data: null, loading: false, error: null, adminsLoading: false, adminsError: null }
  const update = (patch: Partial<ServerOverviewState>) => {
    state = { ...state, ...patch }
    changed(state)
  }
  return {
    configure(nextId: number, nextPeriod: ServerHistoryPeriod, nextActive: boolean) {
      if (id === nextId && period === nextPeriod && active === nextActive) return
      const sameServer = id === nextId && period === nextPeriod
      generation++
      id = nextId
      period = nextPeriod
      active = nextActive
      update({ data: sameServer ? state.data : null, loading: false, error: null, adminsLoading: false, adminsError: null })
      if (active) void this.refresh()
    },
    async refresh() {
      if (!active || state.loading || state.adminsLoading) return
      const version = generation
      update({ loading: true })
      try {
        const data = await source.overview(id, period)
        if (version === generation && active) {
          adminOffset = data.admins.offset + data.admins.items.length
          update({ data, error: null, adminsError: null })
        }
      } catch (error) {
        if (version === generation) update({ error: error instanceof Error ? error.message : `Server statistics are unavailable.` })
      } finally { if (version === generation) update({ loading: false }) }
    },
    async moreAdmins() {
      if (!active || state.loading || state.adminsLoading || !state.data?.admins.hasMore) return
      const version = generation
      const current = state.data
      update({ adminsLoading: true, adminsError: null })
      try {
        const page = await source.admins(id, adminOffset)
        if (version !== generation || !active) return
        adminOffset = page.offset + page.items.length
        const items = [...new Map([...current.admins.items, ...page.items].map(admin => [admin.id, admin])).values()]
        update({ data: { ...current, admins: { ...page, offset: 0, items } } })
      } catch (error) {
        if (version === generation) update({ adminsError: error instanceof Error ? error.message : `Connected admins are unavailable.` })
      } finally { if (version === generation) update({ adminsLoading: false }) }
    },
    destroy() {
      generation++
      active = false
    }
  }
}
