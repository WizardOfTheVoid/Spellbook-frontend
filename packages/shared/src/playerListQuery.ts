export type ParsedPlayerListQuery = {
	page: number
	include?: string[]
	search?: string
	isOnline?: boolean
	active?: boolean
	minRank?: number
	maxRank?: number
	minOffenses?: number
	minPlaytimeHours?: number
	maxPlaytimeHours?: number
	newAccounts?: boolean
	banned?: boolean
	sortBy: PlayerSortField
	sortOrder: PlayerSortOrder
	createdAfter?: string
	createdBefore?: string
}

export class PlayerListQueryError extends Error {}

export const playerSortFields = [`rank`, `lastSeen`, `accountCreated`] as const
export type PlayerSortField = typeof playerSortFields[number]
export const playerSortOrders = [`asc`, `desc`] as const
export type PlayerSortOrder = typeof playerSortOrders[number]

const maxPlayerPage = Math.floor(Number.MAX_SAFE_INTEGER / 100)

export function parsePlayerListQuery(value: unknown): ParsedPlayerListQuery {
	const source = record(value)
	const minRank = integer(source.minRank, `minRank`, 1, 1800)
	const maxRank = integer(source.maxRank, `maxRank`, 1, 1800)
	const minPlaytimeHours = integer(source.minPlaytimeHours, `minPlaytimeHours`, 0, 10000)
	const maxPlaytimeHours = integer(source.maxPlaytimeHours, `maxPlaytimeHours`, 0, 10000)
	const createdAfter = date(source.createdAfter, `createdAfter`)
	const createdBefore = date(source.createdBefore, `createdBefore`)

	if (minRank !== undefined && maxRank !== undefined && minRank > maxRank) {
		throw new PlayerListQueryError(`minRank must not exceed maxRank.`)
	}

	if (minPlaytimeHours !== undefined && maxPlaytimeHours !== undefined && minPlaytimeHours > maxPlaytimeHours) {
		throw new PlayerListQueryError(`minPlaytimeHours must not exceed maxPlaytimeHours.`)
	}

	if (createdAfter && createdBefore && createdAfter > createdBefore) {
		throw new PlayerListQueryError(`createdAfter must not exceed createdBefore.`)
	}

	return {
		page: integer(source.page, `page`, 1, maxPlayerPage) ?? 1,
		include: include(source.include),
		search: string(source.search, `search`, 255),
		isOnline: boolean(source.isOnline, `isOnline`),
		active: boolean(source.active, `active`),
		minRank,
		maxRank,
		minOffenses: integer(source.minOffenses, `minOffenses`, 0, Number.MAX_SAFE_INTEGER),
		minPlaytimeHours,
		maxPlaytimeHours,
		newAccounts: boolean(source.newAccounts, `newAccounts`),
		banned: boolean(source.banned, `banned`),
		sortBy: option(source.sortBy, `sortBy`, playerSortFields) ?? `lastSeen`,
		sortOrder: option(source.sortOrder, `sortOrder`, playerSortOrders) ?? `desc`,
		createdAfter,
		createdBefore
	}
}

function record(value: unknown): Record<string, unknown> {
	if (value === undefined || value === null) return {}
	if (typeof value !== `object` || Array.isArray(value)) {
		throw new PlayerListQueryError(`Player query must be an object.`)
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
		throw new PlayerListQueryError(`${name} must be an integer between ${minimum} and ${maximum}.`)
	}
	return parsed
}

function string(value: unknown, name: string, maximum: number): string | undefined {
	if (value === undefined) return undefined
	if (typeof value !== `string`) throw new PlayerListQueryError(`${name} must be a string.`)
	const normalized = value.trim()
	if (normalized.length > maximum) {
		throw new PlayerListQueryError(`${name} must be ${maximum} characters or fewer.`)
	}
	return normalized || undefined
}

function boolean(value: unknown, name: string): boolean | undefined {
	if (value === undefined) return undefined
	if (value === true || value === `true` || value === `1`) return true
	if (value === false || value === `false` || value === `0`) return false
	throw new PlayerListQueryError(`${name} must be true or false.`)
}

function option<T extends string>(value: unknown, name: string, values: readonly T[]): T | undefined {
	if (value === undefined) return undefined
	if (typeof value !== `string` || !values.includes(value as T)) {
		throw new PlayerListQueryError(`${name} must be one of ${values.join(`, `)}.`)
	}
	return value as T
}

function date(value: unknown, name: string): string | undefined {
	const normalized = string(value, name, 10)
	if (!normalized) return undefined
	const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(normalized)
	const parsed = match && new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
	if (!parsed || parsed.toISOString().slice(0, 10) !== normalized) {
		throw new PlayerListQueryError(`${name} must be a valid YYYY-MM-DD date.`)
	}
	return normalized
}

function include(value: unknown): string[] | undefined {
	if (value === undefined) return undefined
	const items = typeof value === `string` ? value.split(`,`) : Array.isArray(value) ? value : null
	if (!items) throw new PlayerListQueryError(`include must be an array or comma-separated string.`)
	if (items.length === 1 && items[0] === ``) return []

	const normalized = items.map((item, index) => {
		if (typeof item !== `string` || !item.trim() || item.trim().length > 255) {
			throw new PlayerListQueryError(`include[${index}] must be between 1 and 255 characters.`)
		}
		return item.trim()
	})
	const unique = [...new Set(normalized)]
	if (unique.length > 200) throw new PlayerListQueryError(`include must contain 200 IDs or fewer.`)
	return unique
}
