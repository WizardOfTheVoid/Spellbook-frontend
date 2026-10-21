import type { GameServerPlayers, PlayerEntry } from '$lib/core'
import type { PlayerState } from '$lib/types/playerState'
import { mergePlayerState } from '$lib/utils/playerStateData'

export function serverStorePlayers(data: GameServerPlayers): PlayerState[] {
  const db = new Map(data.players.map(player => [player.id, player]))
  return data.roster.players.map((observation, index) => {
    const stored = observation.playerId === null ? null : db.get(observation.playerId) ?? null
    const live: PlayerEntry = {
      index: observation.index ?? index, name: observation.name, playfabId: observation.playfabId ?? stored?.playfabId ?? ``,
      rawLine: ``, eosPlayerId: observation.eosPlayerId ?? null, score: observation.score ?? null,
      kills: observation.kills ?? null, deaths: observation.deaths ?? null, pingMs: observation.pingMs
    }
    const fresh = data.roster.status === `fresh`
    return { ...mergePlayerState(live, stored, fresh), liveKey: observation.key, identity: observation.identity,
      durationSeconds: observation.durationSeconds, durationObservedAt: observation.durationObservedAt,
      isLive: fresh && observation.identity === `listplayers`, dbId: observation.playerId }
  })
}
