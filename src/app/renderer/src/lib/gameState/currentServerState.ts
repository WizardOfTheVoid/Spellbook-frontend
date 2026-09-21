import { writable } from 'svelte/store'
import type { ActiveServerProfile, ChivCoreApi, CurrentGameSnapshot, DbPlayerListItem } from '$lib/core'
import type { PlayerState } from '$lib/types/playerState'
import type { LoadState } from '$lib/types/ui'
import { CurrentGameSnapshotGate } from '$lib/utils/serverPlayerPolling'
import { mergeLivePlayersWithDb } from '$lib/utils/playerStateData'
import { transformPlayerArchive } from '$lib/utils/playerArchive'

export type CurrentServerState = {
  snapshot: CurrentGameSnapshot | null
  players: PlayerState[]
  activeProfile: ActiveServerProfile | null
  playerState: LoadState
  error: string | null
  revision: number
}
type Dependencies = {
  api: () => Pick<ChivCoreApi, `currentGameSnapshot` | `onCurrentGameSnapshot`>
  loadPlayers: (ids: string[]) => Promise<DbPlayerListItem[]>
  enrichPlayers: (ids: string[]) => Promise<number[]>
  loadProfile: (externalId: string) => Promise<ActiveServerProfile>
}

export function createCurrentServerStore(dependencies: Dependencies) {
  const empty = (): CurrentServerState => ({ snapshot: null, players: [], activeProfile: null, playerState: `idle`, error: null, revision: 0 })
  let current = empty()
  const state = writable(current)
  let userId: number | null = null
  let session = 0
  let generation = 0
  let profileRequest = 0
  let profileRevision = ``
  let profileLoading = false
  let rosterLoading = false
  let rosterPending = false
  let enrichmentGeneration: number | null = null
  let dbPlayers: DbPlayerListItem[] = []
  let unsubscribe = () => {}

  function publish(update: Partial<CurrentServerState>): void {
    current = { ...current, ...update }
    state.set(current)
  }

  function mergedPlayers(): PlayerState[] {
    return transformPlayerArchive(mergeLivePlayersWithDb([...(current.snapshot?.players ?? [])], dbPlayers), `live`, [])
  }

  function clear(): void {
    generation++
    profileRequest++
    profileLoading = false
    rosterPending = false
    enrichmentGeneration = null
    dbPlayers = []
    publish({ ...empty(), revision: current.revision + 1 })
  }

  async function refreshProfile(): Promise<void> {
    const externalId = current.snapshot?.externalId
    if (userId === null || !externalId) return
    const request = ++profileRequest
    profileLoading = true
    try {
      const activeProfile = await dependencies.loadProfile(externalId)
      if (request === profileRequest) publish({ activeProfile })
    } catch {
      if (request === profileRequest) publish({ activeProfile: null })
    } finally {
      if (request === profileRequest) profileLoading = false
    }
  }

  async function enrichMissingPlayers(): Promise<void> {
    if (enrichmentGeneration === generation) return
    const ids = dbPlayers.filter(player => player.rank === null || player.rank === undefined).map(player => player.playfabId)
    if (!ids.length) return
    const request = generation
    enrichmentGeneration = request
    try {
      const enriched = await dependencies.enrichPlayers(ids)
      if (request === generation && enriched.length) await refreshRoster()
    } catch (error) {
      console.warn(`[Players] Background XP enrichment failed`, error)
    } finally {
      if (enrichmentGeneration === request) enrichmentGeneration = null
    }
  }

  async function refreshRoster(): Promise<void> {
    if (userId === null || !current.snapshot) return
    if (rosterLoading) {
      rosterPending = true
      return
    }
    rosterLoading = true
    const request = generation
    const ids = [...new Set(current.snapshot.players.map(player => player.playfabId))]
    try {
      const players = ids.length ? await dependencies.loadPlayers(ids) : []
      if (request !== generation) return
      dbPlayers = players
      publish({ players: mergedPlayers(), playerState: `ok`, error: null })
      void enrichMissingPlayers()
    } catch (error) {
      if (request === generation) publish({ playerState: `error`, error: error instanceof Error ? error.message : `Players request failed.` })
    } finally {
      rosterLoading = false
      if (rosterPending) {
        rosterPending = false
        void refreshRoster()
      }
    }
  }

  function apply(snapshot: CurrentGameSnapshot | null): void {
    if (!snapshot) {
      clear()
      return
    }
    const changed = current.snapshot?.externalId !== snapshot.externalId
    if (changed) clear()
    current = { ...current, snapshot }
    publish({ players: mergedPlayers(), revision: current.revision + 1,
      playerState: current.players.length ? current.playerState : `loading`, error: null })
    void refreshRoster()
    if (changed || (!current.activeProfile && !profileLoading)) void refreshProfile()
  }

  async function hydrate(currentSession: number, gate: CurrentGameSnapshotGate): Promise<void> {
    try {
      const snapshot = await dependencies.api().currentGameSnapshot()
      if (currentSession === session && gate.acceptHydration(snapshot)) apply(snapshot)
    } catch (error) {
      if (currentSession === session && !current.snapshot) publish({ playerState: `error`,
        error: error instanceof Error ? error.message : `Current game snapshot failed.` })
    }
  }

  function sync(nextUserId: number | null, nextProfileRevision = ``): void {
    if (userId === nextUserId) {
      if (profileRevision !== nextProfileRevision) {
        profileRevision = nextProfileRevision
        void refreshProfile()
      }
      return
    }
    userId = nextUserId
    profileRevision = nextProfileRevision
    session++
    unsubscribe()
    unsubscribe = () => {}
    clear()
    if (userId === null) return
    const currentSession = session
    const gate = new CurrentGameSnapshotGate()
    try {
      unsubscribe = dependencies.api().onCurrentGameSnapshot(snapshot => {
        if (currentSession === session && gate.acceptEvent(snapshot)) apply(snapshot)
      })
      void hydrate(currentSession, gate)
    } catch (error) {
      publish({ playerState: `error`, error: error instanceof Error ? error.message : `Current game snapshot unavailable.` })
    }
  }

  return { subscribe: state.subscribe, sync, refreshProfile }
}
