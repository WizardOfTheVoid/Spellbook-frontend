type PlayerSnapshot = { gameServerId: number | null, observedAt: string, players: readonly { playfabId: string }[] }

export function canExecuteForPlayer(snapshot: PlayerSnapshot | null, playfabId: string, gameServerId?: number, now = Date.now()): boolean {
  return Boolean(snapshot?.gameServerId && (!gameServerId || snapshot.gameServerId === gameServerId)
    && now - Date.parse(snapshot.observedAt) <= 15000 && now >= Date.parse(snapshot.observedAt)
    && snapshot.players.some(player => player.playfabId === playfabId))
}
