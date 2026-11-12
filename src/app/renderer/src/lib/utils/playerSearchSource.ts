import type { PlayerListMeta } from './playersApi'

export type PlayerSearchMode = `normal` | `historic`

export function canSearchPlayerHistory(meta: PlayerListMeta): boolean {
  return meta.searchSource === `opensearch` && (meta.totalResults ?? 0) > 0
}
