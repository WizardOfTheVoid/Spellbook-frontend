export const gameServerDeletedStates = [`active`, `deleted`, `all`] as const
export type GameServerDeletedState = typeof gameServerDeletedStates[number]

export const gameServerSortFields = [`default`, `players`, `alphabetical`] as const
export type GameServerSortField = typeof gameServerSortFields[number]

export const gameServerSortOrders = [`asc`, `desc`] as const
export type GameServerSortOrder = typeof gameServerSortOrders[number]

export type GameServerListQueryInput = {
	page?: number
	search?: string
	official?: boolean | null
	region?: string
	gameMode?: string
	minSlots?: number
	maxSlots?: number
	minPlayers?: number
	maxPlayers?: number
	duels?: boolean
	deleted?: GameServerDeletedState
	sortBy?: GameServerSortField
	sortOrder?: GameServerSortOrder
	includeMainMenu?: boolean
	yours?: boolean
}

export type ParsedGameServerListQuery = {
	page: number
	search?: string
	official?: boolean | null
	region?: string
	gameMode?: string
	minSlots?: number
	maxSlots?: number
	minPlayers?: number
	maxPlayers?: number
	duels: boolean
	deleted: GameServerDeletedState
	sortBy: GameServerSortField
	sortOrder: GameServerSortOrder
	includeMainMenu: boolean
	yours: boolean
}

export class GameServerListQueryError extends Error {}

const maxPage = Math.floor(Number.MAX_SAFE_INTEGER / 100)
const maxSlots = 90

export function parseGameServerListQuery(value: unknown): ParsedGameServerListQuery {
	const source = record(value)
	const search = string(source.search, `search`)
	const officialValue = official(source.official)
	const region = string(source.region, `region`)
	const gameMode = string(source.gameMode, `gameMode`)
	const minSlots = integer(source.minSlots, `minSlots`, 1, maxSlots)
	const maxSlotsValue = integer(source.maxSlots, `maxSlots`, 1, maxSlots)
	const minPlayers = integer(source.minPlayers, `minPlayers`, 0, maxSlots)
	const maxPlayers = integer(source.maxPlayers, `maxPlayers`, 0, maxSlots)

	if (minSlots !== undefined && maxSlotsValue !== undefined && minSlots > maxSlotsValue) {
		throw new GameServerListQueryError(`minSlots must not exceed maxSlots.`)
	}
	if (minPlayers !== undefined && maxPlayers !== undefined && minPlayers > maxPlayers) {
		throw new GameServerListQueryError(`minPlayers must not exceed maxPlayers.`)
	}

	return {
		page: integer(source.page, `page`, 1, maxPage) ?? 1,
		...(search !== undefined && { search }),
		...(officialValue !== undefined && { official: officialValue }),
		...(region !== undefined && { region }),
		...(gameMode !== undefined && { gameMode }),
		...(minSlots !== undefined && { minSlots }),
		...(maxSlotsValue !== undefined && { maxSlots: maxSlotsValue }),
		...(minPlayers !== undefined && { minPlayers }),
		...(maxPlayers !== undefined && { maxPlayers }),
		duels: boolean(source.duels, `duels`) ?? false,
		deleted: option(source.deleted, `deleted`, gameServerDeletedStates) ?? `active`,
		sortBy: option(source.sortBy, `sortBy`, gameServerSortFields) ?? `default`,
		sortOrder: option(source.sortOrder, `sortOrder`, gameServerSortOrders) ?? `desc`,
		includeMainMenu: boolean(source.includeMainMenu, `includeMainMenu`) ?? false,
		yours: boolean(source.yours, `yours`) ?? false
	}
}

function record(value: unknown): Record<string, unknown> {
	if (value === undefined || value === null) return {}
	if (typeof value !== `object` || Array.isArray(value)) {
		throw new GameServerListQueryError(`Server query must be an object.`)
	}
	return value as Record<string, unknown>
}

function integer(value: unknown, name: string, minimum: number, maximum: number): number | undefined {
	if (value === undefined) return undefined
	const parsed = typeof value === `number`
		? value
		: typeof value === `string` && value.trim()
			? Number(value)
			: Number.NaN

	if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
		throw new GameServerListQueryError(`${name} must be an integer between ${minimum} and ${maximum}.`)
	}
	return parsed
}

function string(value: unknown, name: string): string | undefined {
	if (value === undefined) return undefined
	if (typeof value !== `string`) throw new GameServerListQueryError(`${name} must be a string.`)
	const normalized = value.trim()
	if (normalized.length > 255) {
		throw new GameServerListQueryError(`${name} must be 255 characters or fewer.`)
	}
	return normalized || undefined
}

function official(value: unknown): boolean | null | undefined {
	if (value === undefined) return undefined
	if (value === null || value === `unknown`) return null
	if (value === true || value === 1 || value === `true` || value === `1`) return true
	if (value === false || value === 0 || value === `false` || value === `0`) return false
	throw new GameServerListQueryError(`official must be true, false, or unknown.`)
}

function boolean(value: unknown, name: string): boolean | undefined {
	if (value === undefined) return undefined
	if (value === true || value === `true` || value === `1`) return true
	if (value === false || value === `false` || value === `0`) return false
	throw new GameServerListQueryError(`${name} must be true or false.`)
}

function option<T extends string>(value: unknown, name: string, values: readonly T[]): T | undefined {
	if (value === undefined) return undefined
	if (typeof value !== `string` || !values.includes(value as T)) {
		throw new GameServerListQueryError(`${name} must be one of ${values.join(`, `)}.`)
	}
	return value as T
}
