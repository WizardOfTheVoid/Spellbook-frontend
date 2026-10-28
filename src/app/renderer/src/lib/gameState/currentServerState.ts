import { writable } from 'svelte/store'
import type { ActiveServerProfile, ChivCoreApi, CurrentGameSnapshot, GameServerPlayers } from '$lib/core'
import type { PlayerState } from '$lib/types/playerState'
import type { LoadState } from '$lib/types/ui'
import { CurrentGameSnapshotGate } from '$lib/utils/serverPlayerPolling'
import { serverStorePlayers } from '$lib/serverStore/serverStorePlayers'
import { transformPlayerArchive } from '$lib/utils/playerArchive'

export type CurrentServerState = {
  snapshot: CurrentGameSnapshot | null
  roster: GameServerPlayers[`roster`] | null
  players: PlayerState[]
  activeProfile: ActiveServerProfile | null
  playerState: LoadState
  error: string | null
  revision: number
}
type Dependencies = {
  api: () => Pick<ChivCoreApi, `currentGameSnapshot` | `onCurrentGameSnapshot`>
  loadRoster: (id: number, force?: boolean) => Promise<GameServerPlayers>
  enrichPlayers?: (ids: string[]) => Promise<number[]>
  loadProfile: (externalId: string) => Promise<ActiveServerProfile>
  now?: () => number
  syncCache?: (scope: string) => void
  invalidateRoster?: (id: number) => void
  subscribeRoster?: (listener: (id: number | null, data: GameServerPlayers | null) => void) => () => void
}

export function createCurrentServerStore(dependencies: Dependencies) {
  const empty = (): CurrentServerState => ({ snapshot: null, roster: null, players: [], activeProfile: null, playerState: `idle`, error: null, revision: 0 })
  let current = empty()
  const state = writable(current)
  let userId: number | null = null
  let session = 0
  let generation = 0
  let profileRequest = 0
  let profileLoad: Promise<void> | undefined
  let profileRefreshAgain = false
  let profileRefreshedAt = -Infinity
  const now = dependencies.now ?? Date.now
  let profileRevision = ``
  let enrichedGeneration = -1
  let unsubscribe = () => {}
  let timer: ReturnType<typeof setInterval> | undefined

  function publish(update: Partial<CurrentServerState>) {
    current = { ...current, ...update }
    state.set(current)
  }

  function clear() {
    const id = current.snapshot?.gameServerId
    generation++
    profileRequest++
    profileLoad = undefined
    profileRefreshAgain = false
    profileRefreshedAt = -Infinity
    publish({ ...empty(), revision: current.revision + 1 })
    if (id) dependencies.invalidateRoster?.(id)
  }

  function applyRoster(data: GameServerPlayers | null) {
    publish({ roster: data?.roster ?? null, players: data ? transformPlayerArchive(serverStorePlayers(data), `live`, []) : [],
      playerState: data ? `ok` : `loading`, error: null })
  }

  dependencies.subscribeRoster?.((id, data) => {
    if (current.snapshot && (id === null || current.snapshot.gameServerId === id)) applyRoster(data)
  })

  async function refreshProfile(invalidate = false) {
    const externalId = current.snapshot?.externalId
    if (userId === null || !externalId) return
    if (invalidate) {
      profileRequest++
      publish({ activeProfile: null })
    }
    if (profileLoad) {
      profileRefreshAgain ||= invalidate
      return profileLoad
    }
    const currentGeneration = generation
    const request = ++profileRequest
    profileRefreshedAt = now()
    profileLoad = loadProfile(externalId, request)
    await profileLoad
    if (currentGeneration !== generation) return
    profileLoad = undefined
    if (profileRefreshAgain) {
      profileRefreshAgain = false
      await refreshProfile()
    }
  }

  async function loadProfile(externalId: string, request: number) {
    try {
      const activeProfile = await dependencies.loadProfile(externalId)
      if (request === profileRequest) publish({ activeProfile })
    } catch { if (request === profileRequest) publish({ activeProfile: null }) }
  }

  async function refreshRoster(force = false) {
    const id = current.snapshot?.gameServerId
    if (userId === null || !id) return
    const request = generation
    try {
      const data = await dependencies.loadRoster(id, force)
      if (request === generation) applyRoster(data)
      if (request === generation && enrichedGeneration !== generation && dependencies.enrichPlayers) {
        enrichedGeneration = generation
        const missing = data.players.filter(player => player.rank === null || player.rank === undefined).map(player => player.playfabId)
        if (missing.length) {
          try {
            const enriched = await dependencies.enrichPlayers(missing)
            if (enriched.length && request === generation) await refreshRoster(true)
          } catch { /* Missing profile data does not hide a live observation. */ }
        }
      }
    } catch (error) {
      if (request === generation) publish({ roster: null, players: [], playerState: `error`, error: error instanceof Error ? error.message : `Players request failed.` })
    }
  }

  function apply(snapshot: CurrentGameSnapshot | null) {
    if (!snapshot) {
      clear()
      return
    }
    const changed = current.snapshot?.gameServerId !== snapshot.gameServerId || current.snapshot?.externalId !== snapshot.externalId
    if (changed) clear()
    publish({ snapshot, revision: current.revision + 1, playerState: current.roster ? current.playerState : `loading` })
    void refreshRoster()
    if (changed) void refreshProfile()
  }

  async function hydrate(currentSession: number, gate: CurrentGameSnapshotGate) {
    try {
      const snapshot = await dependencies.api().currentGameSnapshot()
      if (currentSession === session && gate.acceptHydration(snapshot)) apply(snapshot)
    } catch (error) {
      if (currentSession === session) publish({ playerState: `error`, error: error instanceof Error ? error.message : `Current server unavailable.` })
    }
  }

  function sync(nextUserId: number | null, nextProfileRevision = ``) {
    if (userId === nextUserId) {
      if (profileRevision !== nextProfileRevision) {
        profileRevision = nextProfileRevision
        if (current.snapshot) dependencies.invalidateRoster?.(current.snapshot.gameServerId)
        void refreshProfile(true)
        void refreshRoster(true)
      }
      return
    }
    userId = nextUserId
    profileRevision = nextProfileRevision
    session++
    unsubscribe()
    unsubscribe = () => {}
    if (timer) clearInterval(timer)
    clear()
    dependencies.syncCache?.(`${userId}:${session}`)
    if (userId === null) return
    timer = setInterval(() => {
      void refreshRoster()
      if (now() - profileRefreshedAt >= 30_000) void refreshProfile()
    }, 5000)
    const currentSession = session
    const gate = new CurrentGameSnapshotGate()
    try {
      unsubscribe = dependencies.api().onCurrentGameSnapshot(snapshot => {
        if (currentSession === session && gate.acceptEvent(snapshot)) apply(snapshot)
      })
      void hydrate(currentSession, gate)
    } catch (error) { publish({ playerState: `error`, error: error instanceof Error ? error.message : `Current server unavailable.` }) }
  }

  return { subscribe: state.subscribe, sync, refreshProfile, refreshRoster,
    get connectionGeneration() { return generation } }
}
