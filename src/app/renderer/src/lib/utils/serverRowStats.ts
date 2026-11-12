import type { GameServerRecord } from '$lib/core'
import { getServerMode } from '@spellbook/shared/serverMode.js'

export type ServerRowStat = {
  id: `players` | `region` | `mode` | `ping`
  icon: string
  label: string
  value: string
  iconColor: string
}

export function createServerRowStats(server: GameServerRecord): ServerRowStat[] {
  const hasCurrentPlayerCount = server.currentPlayerCount !== undefined
    && server.currentPlayerCount !== null
  const stats: ServerRowStat[] = []
  if (hasCurrentPlayerCount || server.maxPlayers !== null) stats.push({
    id: `players`, icon: `fa-users`, label: `Players`,
    value: `${server.currentPlayerCount ?? `--`}/${server.maxPlayers ?? `?`}`,
    iconColor: `var(--color-accent-secondary)`
  })
  if (server.region) stats.push({
    id: `region`, icon: `fa-earth-europe`, label: `Region`, value: server.region,
    iconColor: `var(--color-accent-tertiary)`
  })
  const mode = getServerMode(server)
  if (mode) stats.push({
    id: `mode`, icon: `fa-swords`, label: `Mode`, value: mode,
    iconColor: `var(--color-accent-primary)`
  })
  const ping = server.live?.sources.a2s.fresh ? server.live.ping : null
  stats.push({
    id: `ping`, icon: `fa-signal`, label: `Ping`, value: ping === null ? `—` : `${Math.round(ping)} ms`,
    iconColor: `var(--color-light-tertiary)`
  })
  return stats
}
