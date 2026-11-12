import type { PlayerListQuery, PlayerSearchRequest } from '$lib/core'
import type { PlayerPage } from './playersApi'
import { hasKnownPlayfabId } from '@spellbook/shared/playerIdentity'
import { prepareLocalPlayerSearch } from './localPlayerSearch'
import { pagePreparedRoster, transformPlayerArchive, type PlayerArchiveResult, type PlayerFilterState, type PreparedPlayerRoster } from './playerArchive'
import { createPlayerRosterRequest } from './playerRosterRequest'
import { mergePlayerState } from './playerStateData'

export type LocalPlayerRoster = {
  query: (query: string, chips: string[], filters: PlayerFilterState, page: number) => PlayerArchiveResult & { rosterPlayers: PreparedPlayerRoster[`players`] }
  refresh: (roster: PreparedPlayerRoster) => LocalPlayerRoster
}

export function prepareLocalPlayerRoster(roster: PreparedPlayerRoster): LocalPlayerRoster {
  const search = prepareLocalPlayerSearch(roster.players)
  return {
    query(query, chips, filters, page) {
      return {
        ...pagePreparedRoster({ ...roster, players: transformPlayerArchive(search.search(query), `live`, chips, filters) }, page),
        rosterPlayers: roster.players
      }
    },
    refresh(next) {
      const stored = new Map(roster.players.flatMap(player => player.dbPlayer ? [[player.playfabId, player.dbPlayer] as const] : []))
      const players = next.players.map(player => {
        const cached = stored.get(player.playfabId)
        if (!cached) return player
        const dbPlayer = { ...cached, ...player.dbPlayer,
          names: player.dbPlayer?.names ?? cached.names,
          rosterFacts: player.dbPlayer?.rosterFacts ?? cached.rosterFacts }
        return { ...player, ...mergePlayerState(player.livePlayer ?? player, dbPlayer, player.isOnline), isLive: player.isLive }
      })
      return prepareLocalPlayerRoster({ ...next, players })
    }
  }
}

export function createLocalPlayerRoster(
  load: (query: PlayerListQuery, request: PlayerSearchRequest) => Promise<PlayerPage>,
  cancel: (request: PlayerSearchRequest) => void
) {
  const requests = createPlayerRosterRequest(load, cancel)
  let current: { key: string, result: Promise<LocalPlayerRoster> } | undefined
  const reset = () => {
    current = undefined
    requests.reset()
  }
  return {
    reset,
    async read(roster: PreparedPlayerRoster, revision: number): Promise<LocalPlayerRoster> {
      const include = [...new Set(roster.players.map(player => player.playfabId).filter(hasKnownPlayfabId))].sort()
      const key = JSON.stringify([include, revision, roster.refreshedAt, roster.state, roster.error])
      if (current?.key !== key) {
        reset()
        current = { key, result: enrich(roster, include, revision) }
      }
      const entry = current
      const prepared = await entry.result
      if (current !== entry) throw new DOMException(`Roster superseded`, `AbortError`)
      return prepared
    }
  }

  async function enrich(roster: PreparedPlayerRoster, include: string[], revision: number): Promise<LocalPlayerRoster> {
    const result = await requests.read(include, revision)
    const stored = new Map(result.players.map(player => [player.playfabId, player]))
    const players = roster.players.map(player => {
      const dbPlayer = stored.get(player.playfabId)
      return dbPlayer ? { ...player, ...mergePlayerState(player.livePlayer ?? player, dbPlayer, player.isOnline) } : player
    })
    return prepareLocalPlayerRoster({ ...roster, players })
  }
}
