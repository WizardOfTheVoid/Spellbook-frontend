import type { CandidatePlayerListItem, DbPlayerListItem, PlayerListQuery, WantedPlayerListItem } from '$lib/core'
import type { PlayerResultSnapshot } from '../components/players/playerResultBatches'
import type { PlayerScrollAnchor } from '../components/players/playerVirtualWindow'
import type { PlayerState } from '$lib/types/playerState'
import type { LoadState } from '$lib/types/ui'
import { applyLocalPlayerFilters, availablePlayerFilterIds, LOW_RANK_MAX } from './playerFilters'
import type { PlayerListMeta } from './playersApi'
import type { ActivePlayerViewId, PlayerViewId } from './playerArchiveControls'
import { maintenanceSession } from '../maintenance/maintenanceSession'

export const MIN_PLAYER_RANK = 1
export const MAX_PLAYER_RANK = 1800
export const PLAYER_RANK_INFINITY = 1801
export const MAX_PLAYTIME_HOURS = 10000
export const PLAYTIME_INFINITY = 10001
export const PLAYTIME_RANGE_STEP = 1
export const MAX_OFFENSE_FILTER = 10

export type PlayerFilterState = {
	offendersOnly: boolean
	createdAfter: string
	createdBefore: string
	lastSeenAfter: string
	lastSeenBefore: string
	minOffenses: number
	minRank: number
	maxRank: number
	minPlaytimeHours: number
	maxPlaytimeHours: number
	sortBy: NonNullable<PlayerListQuery[`sortBy`]> | `kills`
	sortOrder: NonNullable<PlayerListQuery[`sortOrder`]>
	sortExplicit?: boolean
}

export type PlayerArchiveResult = {
	isSearch?: boolean
	players: PlayerState[]
	meta: PlayerListMeta
	state: LoadState
	refreshedAt: string | null
	error: string | null
	rosterPlayers: PlayerState[] | null
}

export type PreparedPlayerRoster = Pick<PlayerArchiveResult, `players` | `state` | `error` | `refreshedAt`>

export function pagePreparedRoster(roster: PreparedPlayerRoster, page: number): PlayerArchiveResult {
	const pageSize = 100
	const totalResults = roster.players.length
	const totalPages = Math.ceil(totalResults / pageSize)
	return {
		...roster,
		players: roster.players.slice((page - 1) * pageSize, page * pageSize),
		rosterPlayers: roster.players,
		meta: { currentPage: page, pageSize, totalPages, totalResults, hasPrevious: page > 1, hasNext: page < totalPages }
	}
}

export const defaultPlayerFilters: PlayerFilterState = {
	offendersOnly: false,
	createdAfter: ``,
	createdBefore: ``,
	lastSeenAfter: ``,
	lastSeenBefore: ``,
	minOffenses: 0,
	minRank: MIN_PLAYER_RANK,
	maxRank: PLAYER_RANK_INFINITY,
	minPlaytimeHours: 0,
	maxPlaytimeHours: PLAYTIME_INFINITY,
	sortBy: `lastSeen`,
	sortOrder: `desc`,
	sortExplicit: false
}

export type PlayerArchiveSource = `players` | `wanted` | `candidates`

export function createDefaultPlayerFilters(source: PlayerArchiveSource = `players`, mode: `database` | `live` = `database`): PlayerFilterState {
  return { ...defaultPlayerFilters, sortBy: mode === `live` ? `kills` : source === `wanted` ? `wantedAt` : source === `candidates` ? `candidateAt` : `lastSeen` }
}

export type PlayerArchiveNavigationState = {
	page: number
	search: string
	searchMode?: `normal` | `historic`
	filters: PlayerFilterState
	activeChipIds: string[]
	advancedFiltersOpen: boolean
	viewId?: PlayerViewId
	viewIds?: ActivePlayerViewId[]
}

export type PlayerArchiveSession = {
	bind: (identity: unknown) => PlayerArchiveNavigationState
	load: () => PlayerArchiveNavigationState
	save: (state: PlayerArchiveNavigationState) => void
	loadResults: (key: string) => PlayerArchiveCachedResults | null
	saveResults: (results: PlayerArchiveCachedResults | null) => void
}

export type PlayerArchiveRow = DbPlayerListItem | WantedPlayerListItem | CandidatePlayerListItem
export type PlayerArchiveCachedResults = PlayerResultSnapshot<PlayerArchiveRow> & { refreshedAt: string | null, scrollTop: number, refreshRevision: number, anchor?: PlayerScrollAnchor | null }

export function createPlayerArchiveSession(source: PlayerArchiveSource = `players`, maintenanceEpoch = maintenanceSession.epoch): PlayerArchiveSession {
	let state = createPlayerArchiveDefaultSessionState(source)
	let identity: unknown = unboundArchiveIdentity
	let results: PlayerArchiveCachedResults | null = null
	let resultsEpoch = maintenanceEpoch()

	return {
		bind: nextIdentity => {
			if (identity !== unboundArchiveIdentity && identity !== nextIdentity) {
				state = createPlayerArchiveDefaultSessionState(source)
				results = null
			}
			identity = nextIdentity
			return clonePlayerArchiveNavigationState(state)
		},
		load: () => clonePlayerArchiveNavigationState(state),
		save: next => {
			state = clonePlayerArchiveNavigationState(next)
		},
		loadResults: key => {
			if (results?.key !== key || resultsEpoch !== maintenanceEpoch()) results = null
			return results
		},
		saveResults: next => {
			results = next
			resultsEpoch = maintenanceEpoch()
		}
	}
}

const unboundArchiveIdentity = Symbol(`unboundArchiveIdentity`)

export function createPlayerArchiveSessionState(state: {
	page: number
	searchInput: string
	searchMode?: `normal` | `historic`
	filters: PlayerFilterState
	activeChipIds: string[]
	advancedFiltersOpen: boolean
	viewId?: PlayerViewId
	viewIds?: ActivePlayerViewId[]
}): PlayerArchiveNavigationState {
	return clonePlayerArchiveNavigationState({
		page: state.page,
		search: state.searchInput,
		...(state.searchMode === `historic` ? { searchMode: state.searchMode } : {}),
		filters: state.filters,
		activeChipIds: state.activeChipIds,
		advancedFiltersOpen: state.advancedFiltersOpen,
		...(state.viewId ? { viewId: state.viewId } : {}),
		...(state.viewIds ? { viewIds: state.viewIds } : {})
	})
}

function createPlayerArchiveDefaultSessionState(source: PlayerArchiveSource): PlayerArchiveNavigationState {
	return {
		page: 1,
		search: ``,
		filters: createDefaultPlayerFilters(source),
		activeChipIds: [],
		advancedFiltersOpen: false
	}
}

function clonePlayerArchiveNavigationState(
	state: PlayerArchiveNavigationState
): PlayerArchiveNavigationState {
	return {
		...state,
		filters: { ...defaultPlayerFilters, ...state.filters, sortExplicit: state.filters.sortExplicit ?? true },
		activeChipIds: availablePlayerFilterIds(state.activeChipIds),
		...(state.viewIds ? { viewIds: [...state.viewIds] } : {})
	}
}

type PlayerQueryOptions = {
	page: number
	search: string
	searchMode?: `normal` | `historic`
	include?: string[]
	activeChipIds: string[]
	filters: PlayerFilterState
}

export function createPlayerQuery(options: PlayerQueryOptions): PlayerListQuery {
	const { filters, activeChipIds } = options
	const search = options.search.trim() || undefined
	const effectiveSort = effectivePlayerArchiveSort(filters, search ?? ``, Boolean(options.include), options.searchMode)
	const noRank = activeChipIds.includes(`no-rank`)
	const minOffenses = Math.max(
		Math.min(filters.minOffenses, MAX_OFFENSE_FILTER),
		filters.offendersOnly || activeChipIds.includes(`priors`) ? 1 : 0
	)
	const maxRank = activeChipIds.includes(`low-rank`)
		? Math.min(filters.maxRank, LOW_RANK_MAX)
		: filters.maxRank

	return compact({
		page: options.page,
		include: options.include,
		search,
		searchMode: search && options.searchMode === `historic` ? `historic` : undefined,
		isOnline: activeChipIds.includes(`online`) || undefined,
		noRank: noRank || undefined,
		minRank: !noRank && filters.minRank > MIN_PLAYER_RANK ? filters.minRank : undefined,
		maxRank: !noRank && maxRank < PLAYER_RANK_INFINITY ? maxRank : undefined,
		minOffenses: minOffenses || undefined,
		minPlaytimeHours: filters.minPlaytimeHours || undefined,
		maxPlaytimeHours: filters.maxPlaytimeHours < PLAYTIME_INFINITY
			? filters.maxPlaytimeHours
			: undefined,
		newAccounts: activeChipIds.includes(`new-accounts`) || undefined,
		banned: activeChipIds.includes(`banned`) || undefined,
		sortBy: effectiveSort === `kills` || effectiveSort === `lastSeen` && filters.sortExplicit === false && filters.sortBy !== `relevance` ? undefined : effectiveSort,
		sortOrder: effectiveSort === `kills` || effectiveSort === `relevance` || filters.sortBy === `relevance` || filters.sortOrder === `desc` ? undefined : filters.sortOrder,
		createdAfter: validDate(filters.createdAfter),
		createdBefore: validDate(filters.createdBefore),
		lastSeenAfter: validDate(filters.lastSeenAfter),
		lastSeenBefore: validDate(filters.lastSeenBefore)
	})
}

export function effectivePlayerArchiveSort(filters: PlayerFilterState, search: string, live: boolean, searchMode?: `normal` | `historic`): PlayerFilterState[`sortBy`] {
	const sort = !live && search.trim() && filters.sortExplicit === false ? `relevance` : filters.sortBy
	return sort === `relevance` && (!search.trim() || searchMode === `historic`) ? `lastSeen` : sort
}

export function formatRank(value: number): string {
	return value >= PLAYER_RANK_INFINITY ? `INF` : `${value}`
}

export function formatPlaytimeHours(value: number): string {
	return value >= PLAYTIME_INFINITY ? `INF` : `${value} hours`
}

export function hidePlayersWhileLoading(players: PlayerState[], state: LoadState): PlayerState[] {
	return state === `loading` ? [] : players
}

export function transformPlayerArchive(
	players: PlayerState[],
	mode: `database` | `live`,
	activeChipIds: string[],
	filters: PlayerFilterState = defaultPlayerFilters,
	nowMs = Date.now()
): PlayerState[] {
	if (mode === `database`) return players

	const query = createPlayerQuery({ page: 1, search: ``, activeChipIds, filters })
	return applyLocalPlayerFilters(players, activeChipIds)
		.filter(player => matchesLocalFilters(player, query, nowMs))
		.map((player, sourceIndex) => ({ player, sourceIndex }))
		.sort((left, right) => compareLivePlayers(left.player, right.player, filters) || left.sourceIndex - right.sourceIndex)
		.map(({ player }) => player)
}

function matchesLocalFilters(player: PlayerState, query: PlayerListQuery, nowMs: number): boolean {
	const accountCreatedAt = player.dbPlayer?.rosterFacts?.accountCreatedAt
	const rank = player.rank
	const playtime = player.playtimeHours
	return (!query.noRank || rank == null)
		&& (query.minRank === undefined || rank != null && rank >= query.minRank)
		&& (query.maxRank === undefined || rank != null && rank <= query.maxRank)
		&& (query.minPlaytimeHours === undefined || playtime != null && playtime >= query.minPlaytimeHours)
		&& (query.maxPlaytimeHours === undefined || playtime != null && playtime <= query.maxPlaytimeHours)
		&& (!query.minOffenses || (player.dbPlayer?.rosterFacts?.offenseCount ?? 0) >= query.minOffenses)
		&& (!query.banned || Boolean(player.dbPlayer?.activeBanKind))
		&& (!query.isOnline || player.isOnline === true)
		&& (!query.newAccounts || Boolean(accountCreatedAt && Date.parse(accountCreatedAt) >= nowMs - 7 * 86400000))
		&& matchesDateRange(accountCreatedAt, query.createdAfter, query.createdBefore)
		&& matchesDateRange(player.lastSeen ?? player.lastLogin, query.lastSeenAfter, query.lastSeenBefore)
}

function matchesDateRange(value: string | null | undefined, after?: string, before?: string): boolean {
	if (!after && !before) return true
	const date = value?.slice(0, 10)
	return Boolean(date && (!after || date >= after) && (!before || date <= before))
}

function compareLivePlayers(left: PlayerState, right: PlayerState, filters: PlayerFilterState): number {
	if (filters.sortBy === `kills`) return compareKills(left, right, filters.sortOrder)
	const field = filters.sortBy === `rank` ? `rank` : filters.sortBy === `accountCreated` ? `createdAt` : `lastSeen`
	const leftValue = field === `rank` ? left.rank : field === `createdAt` ? left.dbPlayer?.rosterFacts?.accountCreatedAt : left.lastSeen ?? left.lastLogin
	const rightValue = field === `rank` ? right.rank : field === `createdAt` ? right.dbPlayer?.rosterFacts?.accountCreatedAt : right.lastSeen ?? right.lastLogin
	if (leftValue != null && rightValue != null) {
		const difference = typeof leftValue === `number` && typeof rightValue === `number`
			? leftValue - rightValue
			: String(leftValue).localeCompare(String(rightValue))
		if (difference) return filters.sortOrder === `asc` ? difference : -difference
	}
	if (leftValue != null) return -1
	if (rightValue != null) return 1
	return compareKills(left, right)
}

function validDate(value: string): string | undefined {
	const normalized = value.trim()
	const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(normalized)
	const parsed = match && new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
	return parsed?.toISOString().slice(0, 10) === normalized ? normalized : undefined
}

function compareKills(left: PlayerState, right: PlayerState, order: `asc` | `desc` = `desc`): number {
	const leftKills = typeof left.kills === `number` ? left.kills : null
	const rightKills = typeof right.kills === `number` ? right.kills : null
	if (leftKills === null) return rightKills === null ? 0 : 1
	if (rightKills === null) return -1
	return order === `asc` ? leftKills - rightKills : rightKills - leftKills
}

function compact<T extends Record<string, unknown>>(value: T): T {
	return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T
}
