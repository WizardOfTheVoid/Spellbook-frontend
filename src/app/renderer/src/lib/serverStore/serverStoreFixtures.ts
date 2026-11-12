import type { GameServerPlayers } from '$lib/core'

export function rosterFixture(epoch = `epoch`, now = 1000): GameServerPlayers {
  const sample = { observedAt: new Date(now).toISOString(), expiresAt: new Date(now + 60000).toISOString(), fresh: true }
  return { players: [], roster: {
    gameServerId: 1, epoch, revision: 1, endpointGeneration: 1, serverTime: new Date(now).toISOString(),
    source: `listplayers`, status: `fresh`, sources: { listplayers: sample, a2s: sample, directory: sample },
    population: { count: 40, source: `a2s`, observedAt: sample.observedAt }, ping: 20, password: false, maxPlayers: 64, botCount: 0,
    bots: [], players: [{ key: `one`, name: `Canonical`, playerId: 1, playfabId: `ABC`, identity: `listplayers`,
      durationSeconds: 12, durationObservedAt: sample.observedAt, pingMs: 40, bot: false }]
  } }
}
