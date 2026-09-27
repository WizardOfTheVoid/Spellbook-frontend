import type { PlayerListQuery } from '$lib/core'
import type { PlayerState } from '$lib/types/playerState'
import type { LoadState } from '$lib/types/ui'
import { applyLocalPlayerFilters, availablePlayerFilterIds, LOW_RANK_MAX } from './playerFilters'
import type { PlayerListMeta } from './playersApi'
import type { ActivePlayerViewId, PlayerViewId } from './playerArchiveControls'

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
	sortBy: NonNullable<PlayerListQuery[`sortBy`]>
	sortOrder: NonNullable<PlayerListQuery[`sortOrder`]>
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
	sortOrder: `desc`
}

export type PlayerArchiveSource = `players` | `wanted`

export function createDefaultPlayerFilters(source: PlayerArchiveSource = `players`): PlayerFilterState {
	return { ...defaultPlayerFilters, sortBy: source === `wanted` ? `wantedAt` : `lastSeen` }
}

export type PlayerArchiveResetState = {
	page: 1
	searchInput: string
	search: string
	filters: PlayerFilterState
	queryFilters: PlayerFilterState
	activeChipIds: string[]
}

export function createPlayerArchiveResetState(source: PlayerArchiveSource = `players`): PlayerArchiveResetState {
	return {
		page: 1,
		searchInput: ``,
		search: ``,
		filters: createDefaultPlayerFilters(source),
		queryFilters: createDefaultPlayerFilters(source),
		activeChipIds: []
	}
}

export type PlayerArchiveNavigationState = {
	page: number
	search: string
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
}

export function createPlayerArchiveSession(source: PlayerArchiveSource = `players`): PlayerArchiveSession {
	let state = createPlayerArchiveDefaultSessionState(source)
	let identity: unknown = unboundArchiveIdentity

	return {
		bind: nextIdentity => {
			if (identity !== unboundArchiveIdentity && identity !== nextIdentity) {
				state = createPlayerArchiveDefaultSessionState(source)
			}
			identity = nextIdentity
			return clonePlayerArchiveNavigationState(state)
		},
		load: () => clonePlayerArchiveNavigationState(state),
		save: next => {
			state = clonePlayerArchiveNavigationState(next)
		}
	}
}

const unboundArchiveIdentity = Symbol(`unboundArchiveIdentity`)

export function createPlayerArchiveSessionState(state: {
	page: number
	searchInput: string
	filters: PlayerFilterState
	activeChipIds: string[]
	advancedFiltersOpen: boolean
	viewId?: PlayerViewId
	viewIds?: ActivePlayerViewId[]
}): PlayerArchiveNavigationState {
	return clonePlayerArchiveNavigationState({
		page: state.page,
		search: state.searchInput,
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
		filters: { ...defaultPlayerFilters, ...state.filters },
		activeChipIds: availablePlayerFilterIds(state.activeChipIds),
		...(state.viewIds ? { viewIds: [...state.viewIds] } : {})
	}
}

export function countAdvancedPlayerFilters(
	filters: PlayerFilterState,
	mode: `database` | `live`,
	source: PlayerArchiveSource = `players`
): number {
	return [
		filters.offendersOnly !== defaultPlayerFilters.offendersOnly,
		filters.createdAfter !== defaultPlayerFilters.createdAfter,
		filters.createdBefore !== defaultPlayerFilters.createdBefore,
		filters.lastSeenAfter !== defaultPlayerFilters.lastSeenAfter,
		filters.lastSeenBefore !== defaultPlayerFilters.lastSeenBefore,
		filters.minOffenses !== defaultPlayerFilters.minOffenses,
		filters.minRank !== defaultPlayerFilters.minRank
			|| filters.maxRank !== defaultPlayerFilters.maxRank,
		filters.minPlaytimeHours !== defaultPlayerFilters.minPlaytimeHours
			|| filters.maxPlaytimeHours !== defaultPlayerFilters.maxPlaytimeHours,
		mode === `database` && filters.sortBy !== createDefaultPlayerFilters(source).sortBy,
		mode === `database` && filters.sortOrder !== defaultPlayerFilters.sortOrder
	].filter(Boolean).length
}

type PlayerQueryOptions = {
	page: number
	search: string
	include?: string[]
	activeChipIds: string[]
	filters: PlayerFilterState
}

export function createPlayerQuery(options: PlayerQueryOptions): PlayerListQuery {
	const { filters, activeChipIds } = options
	const search = options.search.trim() || undefined
	const noRank = activeChipIds.includes(`no-rank`)
	const minOffenses = Math.max(
		Math.min(filters.minOffenses, MAX_OFFENSE_FILTER),
		filters.offendersOnly || activeChipIds.includes(`priors`) ? 1 : 0
	)
	const maxRank = activeChipIds.includes(`low-rank`)
		? Math.min(filters.maxRank, LOW_RANK_MAX)
		: filters.maxRank

	return compact({
		page: search ? 1 : options.page,
		include: options.include,
		search,
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
		sortBy: filters.sortBy === `lastSeen` ? undefined : filters.sortBy,
		sortOrder: filters.sortOrder === `desc` ? undefined : filters.sortOrder,
		createdAfter: validDate(filters.createdAfter),
		createdBefore: validDate(filters.createdBefore),
		lastSeenAfter: validDate(filters.lastSeenAfter),
		lastSeenBefore: validDate(filters.lastSeenBefore)
	})
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

export function preparePlayerArchiveLoad(
	state: LoadState,
	players: PlayerState[],
	silent: boolean,
): { state: LoadState, players: PlayerState[] } {
	return silent ? { state, players } : { state: `loading`, players: [] }
}

export function resolveFailedRosterPlayers(
	players: PlayerState[] | null,
	live: boolean,
	silent: boolean,
): PlayerState[] | null {
	return live ? (silent ? players : []) : null
}

export function transformPlayerArchive(
	players: PlayerState[],
	mode: `database` | `live`,
	activeChipIds: string[],
	filters: PlayerFilterState = defaultPlayerFilters
): PlayerState[] {
	if (mode === `database`) return players

	return applyLocalPlayerFilters(players, activeChipIds)
		.map((player, sourceIndex) => ({ player, sourceIndex }))
		.sort((left, right) => compareLivePlayers(left.player, right.player, filters) || left.sourceIndex - right.sourceIndex)
		.map(({ player }) => player)
}

function compareLivePlayers(left: PlayerState, right: PlayerState, filters: PlayerFilterState): number {
	const field = filters.sortBy === `rank` ? `rank` : filters.sortBy === `accountCreated` ? `createdAt` : `lastSeen`
	const leftValue = field === `rank` ? left.rank : field === `createdAt` ? left.createdAt : left.lastSeen ?? left.lastLogin
	const rightValue = field === `rank` ? right.rank : field === `createdAt` ? right.createdAt : right.lastSeen ?? right.lastLogin
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

export function hasBackendPlayerFilters(
	search: string,
	activeChipIds: string[],
	filters: PlayerFilterState
): boolean {
	return Boolean(
		search.trim()
		|| activeChipIds.some(id => id === `no-rank` || id === `low-rank` || id === `priors`)
		|| filters.offendersOnly
		|| filters.minOffenses
		|| filters.minRank > MIN_PLAYER_RANK
		|| filters.maxRank < PLAYER_RANK_INFINITY
		|| filters.minPlaytimeHours
		|| filters.maxPlaytimeHours < PLAYTIME_INFINITY
		|| activeChipIds.some(id => id === `new-accounts` || id === `banned` || id === `online`)
		|| validDate(filters.createdAfter)
		|| validDate(filters.createdBefore)
		|| validDate(filters.lastSeenAfter)
		|| validDate(filters.lastSeenBefore)
	)
}

function validDate(value: string): string | undefined {
	const normalized = value.trim()
	const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(normalized)
	const parsed = match && new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
	return parsed?.toISOString().slice(0, 10) === normalized ? normalized : undefined
}

function compareKills(left: PlayerState, right: PlayerState): number {
	const leftKills = typeof left.kills === `number` ? left.kills : null
	const rightKills = typeof right.kills === `number` ? right.kills : null
	if (leftKills === null) return rightKills === null ? 0 : 1
	if (rightKills === null) return -1
	return rightKills - leftKills
}

function compact<T extends Record<string, unknown>>(value: T): T {
	return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T
}
