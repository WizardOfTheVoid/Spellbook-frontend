import type { GameServerRecord } from '$lib/core'

export type ServerRowStat = {
  id: `provider` | `players` | `region` | `mode`
  icon: string
  label: string
  value: string
  iconColor: string
}

export function createServerRowStats(server: GameServerRecord): ServerRowStat[] {
  const hasCurrentPlayerCount = server.currentPlayerCount !== undefined
    && server.currentPlayerCount !== null
  const stats: ServerRowStat[] = [{
    id: `provider`,
    icon: `fa-building`,
    label: `Provider`,
    value: server.official === true ? `TB` : server.official === false ? `Nitrado` : `Unknown`,
    iconColor: `var(--color-accent-primary)`
  }]
  if (hasCurrentPlayerCount || server.maxPlayers !== null) stats.push({
    id: `players`, icon: `fa-users`, label: `Players`,
    value: `${server.currentPlayerCount ?? `--`}/${server.maxPlayers ?? `?`}`,
    iconColor: `var(--color-accent-secondary)`
  })
  if (server.region) stats.push({
    id: `region`, icon: `fa-earth-europe`, label: `Region`, value: server.region,
    iconColor: `var(--color-accent-tertiary)`
  })
  if (server.gameMode) stats.push({
    id: `mode`, icon: `fa-swords`, label: `Game mode`, value: server.gameMode,
    iconColor: `var(--color-accent-primary)`
  })
  return stats
}
