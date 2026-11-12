import { isPlayerActionSnapshotFresh } from '../../../../../../shared/playerActionFreshness'

type PlayerSnapshot = { gameServerId: number | null, observedAt: string, players: readonly { playfabId: string }[] }

export const playerActionIssueMessages = {
  noCurrentServer: `Join a game server and refresh players before using player actions.`,
  serverChanged: `The current server changed. Reopen the actions.`,
  rosterStale: `Your player list is out of date. Refresh players and try again.`,
  playerAbsent: `This player is not in your current server.`
} as const

export function canExecuteForPlayer(snapshot: PlayerSnapshot | null, playfabId: string, gameServerId?: number, clockTick = Date.now()): boolean {
  return playerActionBlockReason(snapshot, playfabId, gameServerId, clockTick) === null
}

export function playerActionBlockReason(snapshot: PlayerSnapshot | null, playfabId: string, gameServerId?: number,
  clockTick = Date.now()): keyof typeof playerActionIssueMessages | null {
  const issue = playerActionTargetBlockReason(snapshot, playfabId, gameServerId)
  if (issue) return issue
  // A new roster can arrive between the UI clock's ticks.
  return isPlayerActionSnapshotFresh(snapshot!.observedAt, Math.max(clockTick, Date.now())) ? null : `rosterStale`
}

export function playerActionTargetBlockReason(snapshot: PlayerSnapshot | null, playfabId: string, gameServerId?: number): keyof typeof playerActionIssueMessages | null {
  if (!snapshot?.gameServerId) return `noCurrentServer`
  if (gameServerId && snapshot.gameServerId !== gameServerId) return `serverChanged`
  return snapshot.players.some(player => player.playfabId === playfabId) ? null : `playerAbsent`
}
