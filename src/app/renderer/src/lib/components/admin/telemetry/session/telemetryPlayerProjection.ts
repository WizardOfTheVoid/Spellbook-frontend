import type { PlayerStateSnapshot } from '../../../../../../../shared/telemetry/telemetryTypes'

export function selectDisplayPlayers(states: readonly PlayerStateSnapshot[]): PlayerStateSnapshot[] {
  const players = new Map<string, PlayerStateSnapshot>()
  const priority = (player: PlayerStateSnapshot) =>
    Number(player.active) * 8 + Number(player.observationKind !== `account`) * 4 + Number(player.direction !== `toServer`) * 2 +
    Number([player.health, player.stamina, player.combatState, player.inventory].some(value => value !== null && value !== undefined))
  for (const state of states) {
    const existing = players.get(state.trackId)
    if (!existing || priority(state) > priority(existing) ||
      (priority(state) === priority(existing) && state.elapsedUs > existing.elapsedUs))
      players.set(state.trackId, state)
  }
  return [...players.values()]
}
