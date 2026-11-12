import { derived, get, writable } from 'svelte/store'
import { getServerApi, type TeamListRecord, type TeamRecord } from '$lib/core'
import { unwrap } from '$lib/utils/apiResult'

type StorageAccess = Pick<Storage, `getItem` | `setItem` | `removeItem`>
export type CurrentTeamState = {
  userId: number | null
  teams: TeamListRecord[]
  currentTeamId: number | null
  selectionRevision: number
  loading: boolean
  error: string | null
}
type ServerObservation = { connectionKey: string | null, ownerTeamId: number | null, ownershipResolved: boolean }

export const canReadTeam = (team: TeamRecord) => team.isMember !== false && team.permissions.some(value => value === `read` || value === `admin`)

export function createCurrentTeamStore(dependencies: { loadTeams(): Promise<TeamListRecord[]>, storage(): StorageAccess }) {
  const empty = (userId: number | null): CurrentTeamState => ({ userId, teams: [], currentTeamId: null, selectionRevision: 0, loading: false, error: null })
  const state = writable(empty(null))
  let session = 0
  let manualRevision = 0
  let pending: Promise<void> | null = null
  let loaded = false
  let restored = false
  let visit: { key: string, revision: number, decided: boolean } | null = null
  let observation: ServerObservation = { connectionKey: null, ownerTeamId: null, ownershipResolved: false }

  function remember(id: number | null) {
    const userId = get(state).userId
    if (userId === null) return
    try {
      const key = `spellbook:currentTeam:${userId}`
      if (id === null) dependencies.storage().removeItem(key)
      else dependencies.storage().setItem(key, String(id))
    } catch { /* Selection remains usable without local storage. */ }
  }

  function apply(id: number | null) {
    if (get(state).currentTeamId !== id) state.update(value => ({ ...value, currentTeamId: id }))
    remember(id)
  }

  function applyServer() {
    if (!visit || visit.decided || !loaded || !observation.ownershipResolved) return
    visit.decided = true
    if (visit.revision !== manualRevision) return
    const team = get(state).teams.find(value => value.id === observation.ownerTeamId && canReadTeam(value))
    if (team) apply(team.id)
  }

  async function load(currentSession: number, revision: number) {
    try {
      const teams = (await dependencies.loadTeams()).filter(team => team.isMember !== false)
      if (session !== currentSession) return
      loaded = true
      state.update(value => ({ ...value, teams, loading: false, error: null }))
      if (!restored && manualRevision === revision) {
        let saved: number | null = null
        try {
          const raw = dependencies.storage().getItem(`spellbook:currentTeam:${get(state).userId}`)
          const parsed = raw === null ? NaN : Number(raw)
          if (Number.isSafeInteger(parsed) && parsed > 0) saved = parsed
        } catch { /* Missing storage is equivalent to no remembered team. */ }
        restored = true
        if (saved !== null) apply(teams.some(team => team.id === saved && canReadTeam(team)) ? saved : null)
      }
      const selected = get(state).currentTeamId
      if (selected !== null && !teams.some(team => team.id === selected && canReadTeam(team))) apply(null)
      applyServer()
    } catch (error) {
      if (session === currentSession) state.update(value => ({ ...value, loading: false, error: error instanceof Error ? error.message : `Teams could not be loaded.` }))
    }
  }

  async function refresh(): Promise<void> {
    if (get(state).userId === null) return
    if (pending) return pending
    const currentSession = session
    state.update(value => ({ ...value, loading: true, error: null }))
    pending = load(currentSession, manualRevision)
    await pending
    if (session === currentSession) pending = null
  }

  function syncUser(userId: number | null) {
    if (get(state).userId === userId) return
    session++
    manualRevision = 0
    pending = null
    loaded = false
    restored = false
    visit = null
    observation = { connectionKey: null, ownerTeamId: null, ownershipResolved: false }
    state.set(empty(userId))
    if (userId !== null) void refresh()
  }

  function select(teamId: number): boolean {
    if (!get(state).teams.some(team => team.id === teamId && canReadTeam(team))) return false
    manualRevision++
    restored = true
    state.update(value => ({ ...value, currentTeamId: teamId, selectionRevision: manualRevision }))
    remember(teamId)
    return true
  }

  function updateRequestCount(teamId: number, count: number, userId: number | null): boolean {
    const current = get(state)
    if (userId === null || current.userId !== userId || !Number.isSafeInteger(count) || count < 0) return false
    if (!current.teams.some(team => team.id === teamId && team.permissions.includes(`admin`))) return false
    state.update(value => ({ ...value, teams: value.teams.map(team => team.id === teamId ? { ...team, pendingRequestCount: count } : team) }))
    return true
  }

  function observeServer(next: ServerObservation) {
    if (get(state).userId === null) return
    observation = next
    if (next.connectionKey === null) { visit = null; return }
    if (visit?.key !== next.connectionKey) visit = { key: next.connectionKey, revision: manualRevision, decided: false }
    applyServer()
  }

  return { subscribe: state.subscribe, syncUser, refresh, select, observeServer, updateRequestCount }
}

export const currentTeamState = createCurrentTeamStore({
  loadTeams: async () => unwrap<TeamListRecord[]>(await getServerApi().teams.list(), `Teams could not be loaded.`),
  storage: () => window.localStorage
})
export const currentTeam = derived(currentTeamState, state => state.teams.find(team => team.id === state.currentTeamId && canReadTeam(team)) ?? null)
