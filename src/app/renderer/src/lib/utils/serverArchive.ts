import type { GameServerListQueryInput } from '$lib/core'
import type { FilterChip } from '$lib/types/ui'

export type ServerFilterState = {
  yours: boolean
  duels: boolean
  official: boolean | null | undefined
  region: string
  gameMode: string
  minSlots: number
  maxSlots: number
  minPlayers: number
  maxPlayers: number
  deleted: NonNullable<GameServerListQueryInput[`deleted`]>
  sortBy: NonNullable<GameServerListQueryInput[`sortBy`]>
  sortOrder: NonNullable<GameServerListQueryInput[`sortOrder`]>
}

export const defaultServerFilters: ServerFilterState = {
  yours: false,
  duels: false,
  official: undefined,
  region: ``,
  gameMode: ``,
  minSlots: 1,
  maxSlots: 90,
  minPlayers: 0,
  maxPlayers: 90,
  deleted: `active`,
  sortBy: `default`,
  sortOrder: `desc`
}

export const SERVER_FILTER_CHIPS: FilterChip[] = [
  { id: `yours`, label: `Mine`, icon: `fa-user-group`, tooltip: `Servers attached to you or a team you can access.` },
  { id: `tb`, label: `TB`, icon: `fa-building`, tooltip: `Official Torn Banner servers.` },
  { id: `nitrado`, label: `Nitrado`, icon: `fa-server`, tooltip: `Community-hosted Nitrado servers.` },
  { id: `duels`, label: `Duels`, icon: `fa-swords`, tooltip: `Community FFA servers named duel or 1v1.` }
]

export function createDefaultServerFilters(): ServerFilterState {
  return { ...defaultServerFilters }
}

export function createServerQuery(options: {
  page: number
  search: string
  filters: ServerFilterState
}): GameServerListQueryInput {
  const { filters } = options
  return compact({
    page: options.page,
    search: options.search.trim() || undefined,
    yours: filters.yours || undefined,
    duels: filters.duels || undefined,
    official: filters.official,
    region: filters.region.trim() || undefined,
    gameMode: filters.gameMode.trim() || undefined,
    minSlots: filters.minSlots === 1 ? undefined : filters.minSlots,
    maxSlots: filters.maxSlots === 90 ? undefined : filters.maxSlots,
    minPlayers: filters.minPlayers === 0 ? undefined : filters.minPlayers,
    maxPlayers: filters.maxPlayers === 90 ? undefined : filters.maxPlayers,
    deleted: filters.deleted === `active` ? undefined : filters.deleted,
    sortBy: filters.sortBy === `default` ? undefined : filters.sortBy,
    sortOrder: filters.sortBy === `default` || filters.sortOrder === `desc` ? undefined : filters.sortOrder
  })
}

export function toggleServerFilter(filters: ServerFilterState, id: string): ServerFilterState {
  if (id === `yours`) return { ...filters, yours: !filters.yours }
  if (id === `duels`) return { ...filters, duels: !filters.duels }
	const provider = id === `tb` ? true : id === `nitrado` ? false : undefined
  if (provider === undefined) return filters
  return { ...filters, official: filters.official === provider ? undefined : provider }
}

export function selectedServerChipIds(filters: ServerFilterState): string[] {
  return [
    filters.yours ? `yours` : null,
	filters.official === true ? `tb` : filters.official === false ? `nitrado` : null,
	filters.duels ? `duels` : null
  ].filter((id): id is string => id !== null)
}

export function countAdvancedServerFilters(filters: ServerFilterState): number {
  return [
    Boolean(filters.region.trim()),
    Boolean(filters.gameMode.trim()),
    filters.minSlots !== 1 || filters.maxSlots !== 90,
	filters.minPlayers !== 0 || filters.maxPlayers !== 90,
    filters.deleted !== `active`,
	filters.sortBy !== `default`,
	filters.sortBy !== `default` && filters.sortOrder !== `desc`
  ].filter(Boolean).length
}

export function resolveServerPageAfterMutation(page: number, rowCount: number): number {
  return rowCount === 0 ? Math.max(1, page - 1) : page
}

function compact<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T
}

