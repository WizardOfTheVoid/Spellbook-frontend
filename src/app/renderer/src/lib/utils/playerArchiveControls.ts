import { createDefaultPlayerFilters, defaultPlayerFilters, type PlayerArchiveSource, type PlayerFilterState } from './playerArchive'
import { PLAYER_FILTER_CHIPS } from './playerFilters'

export type PlayerViewId = `all` | `online` | `new-accounts` | `low-rank` | `banned` | `priors`
export type ActivePlayerViewId = Exclude<PlayerViewId, `all`>
export type PlayerFilterTag = { key: string, id: string, label: string, icon: string, origin: `view` | `filter` }

export const playerViewPresets: { id: ActivePlayerViewId, name: string, subtitle: string, icon: string }[] = [
  { id: `online`, name: `Online`, subtitle: `Players currently online`, icon: `fa-circle` },
  { id: `new-accounts`, name: `New players`, subtitle: `Joined in the last 7 days`, icon: `fa-star` },
  { id: `low-rank`, name: `Low rank`, subtitle: `Rank below 50`, icon: `fa-chart-column` },
  { id: `banned`, name: `Banned`, subtitle: `Active bans`, icon: `fa-ban` },
  { id: `priors`, name: `Priors`, subtitle: `With prior offenses`, icon: `fa-file-lines` }
]

const chipOptions = new Map(PLAYER_FILTER_CHIPS.map(chip => [chip.id, chip]))

export function togglePlayerView(viewIds: readonly ActivePlayerViewId[], id: PlayerViewId): ActivePlayerViewId[] {
  if (id === `all`) return []
  return viewIds.includes(id) ? viewIds.filter(viewId => viewId !== id) : [...viewIds, id]
}

export function effectivePlayerFilterIds(viewIds: readonly ActivePlayerViewId[], chipIds: readonly string[]): string[] {
  return [...new Set([...viewIds, ...chipIds])]
}

export function removePlayerFilterTag(
  state: { viewIds: ActivePlayerViewId[], chipIds: string[] },
  key: string
): { viewIds: ActivePlayerViewId[], chipIds: string[] } {
  const [origin, id] = key.split(`:`)
  return {
    viewIds: origin === `view` ? state.viewIds.filter(viewId => viewId !== id) : state.viewIds,
    chipIds: origin === `filter` ? state.chipIds.filter(chipId => chipId !== id) : state.chipIds
  }
}

export function clearPlayerArchiveFilters(
  filters: PlayerFilterState,
  source: PlayerArchiveSource = `players`
): { viewIds: ActivePlayerViewId[], chipIds: string[], filters: PlayerFilterState } {
  return {
    viewIds: [],
    chipIds: [],
    filters: { ...createDefaultPlayerFilters(source), sortBy: filters.sortBy, sortOrder: filters.sortOrder }
  }
}

export function removeAdvancedPlayerFilter(filters: PlayerFilterState, id: string): PlayerFilterState {
  const next = { ...filters }
  if (id === `offendersOnly`) next.offendersOnly = false
  if (id === `minOffenses`) next.minOffenses = 0
  if (id === `created`) {
    next.createdAfter = ``
    next.createdBefore = ``
  }
  if (id === `lastSeen`) {
    next.lastSeenAfter = ``
    next.lastSeenBefore = ``
  }
  if (id === `rank`) {
    next.minRank = defaultPlayerFilters.minRank
    next.maxRank = defaultPlayerFilters.maxRank
  }
  if (id === `playtime`) {
    next.minPlaytimeHours = defaultPlayerFilters.minPlaytimeHours
    next.maxPlaytimeHours = defaultPlayerFilters.maxPlaytimeHours
  }
  return next
}

export function activePlayerFilterTags(
  filters: PlayerFilterState,
  viewIds: readonly ActivePlayerViewId[],
  chipIds: readonly string[]
): PlayerFilterTag[] {
  const tags: PlayerFilterTag[] = viewIds.map(id => {
    const preset = playerViewPresets.find(view => view.id === id)
    return { key: `view:${id}`, id, label: preset?.name ?? id, icon: `fa-users`, origin: `view` }
  })
  for (const id of chipIds) {
    const chip = chipOptions.get(id)
    tags.push({ key: `filter:${id}`, id, label: chip?.label ?? id, icon: `fa-filter`, origin: `filter` })
  }
  const advanced = (id: string, label: string): void => { tags.push({ key: `filter:${id}`, id, label, icon: `fa-filter`, origin: `filter` }) }
  if (filters.offendersOnly) advanced(`offendersOnly`, `Offenders`)
  if (filters.minOffenses > 0) advanced(`minOffenses`, `Minimum offenses ≥ ${filters.minOffenses}`)
  if (filters.createdAfter || filters.createdBefore) advanced(`created`, `Account created`)
  if (filters.lastSeenAfter || filters.lastSeenBefore) advanced(`lastSeen`, `Last active`)
  if (filters.minRank !== defaultPlayerFilters.minRank || filters.maxRank !== defaultPlayerFilters.maxRank) {
    advanced(`rank`, `Rank range`)
  }
  if (filters.minPlaytimeHours !== defaultPlayerFilters.minPlaytimeHours || filters.maxPlaytimeHours !== defaultPlayerFilters.maxPlaytimeHours) {
    advanced(`playtime`, `Playtime range`)
  }
  return tags
}

export type PlayerArchiveScrollPosition = { top: number, maxTop: number }

export function shouldHidePlayerFilterTags(
  current: PlayerArchiveScrollPosition,
  previous: PlayerArchiveScrollPosition,
  hidden: boolean
): boolean {
  const scrollDelta = current.top - previous.top
  const rangeDelta = current.maxTop - previous.maxTop
  if (rangeDelta !== 0 && Math.abs(scrollDelta - rangeDelta) <= 1) return hidden
  if (current.top <= 100) return false
  if (scrollDelta > 0) return true
  if (scrollDelta < 0) return false
  return hidden
}
