import type { PlayerListMeta } from './playersApi'

export type PlayerSearchMode = `normal` | `historic`

export function nextPlayerSearchMode(mode: PlayerSearchMode, meta: PlayerListMeta): PlayerSearchMode {
  return meta.searchSource === `historic` ? `historic` : mode
}

export function canSearchPlayerHistory(meta: PlayerListMeta): boolean {
  return meta.searchSource === `opensearch` && (meta.totalResults ?? 0) > 0
}
