import { getServerApi, type DbPlayerListItem, type PlayerListQuery } from '$lib/core'
import { unwrap } from './apiResult'
import { extractDbPlayers } from './dbPlayers'
import { getBooleanField, getNumberField, getRecordField, isRecord } from './records'

export type PlayerListMeta = {
	currentPage: number
	pageSize: 100
	totalPages: number
	totalResults: number
	hasPrevious: boolean
	hasNext: boolean
}

export type PlayerPage = {
	players: DbPlayerListItem[]
	meta: PlayerListMeta
}

export async function getPlayers(query: PlayerListQuery = {}): Promise<PlayerPage> {
	const data = await unwrap<unknown>(
		await getServerApi().getPlayers(query),
		`Players request failed.`
	)
	return parsePlayerPage(data)
}

export function parsePlayerPage(value: unknown): PlayerPage {
	if (!isRecord(value) || !Array.isArray(value.players)) throw invalidMetadata()
	const meta = getRecordField(value, `meta`)
	const currentPage = integer(meta, `currentPage`, 1)
	const pageSize = integer(meta, `pageSize`, 100)
	const totalPages = integer(meta, `totalPages`, 0)
	const totalResults = integer(meta, `totalResults`, 0)
	const hasPrevious = getBooleanField(meta, `hasPrevious`)
	const hasNext = getBooleanField(meta, `hasNext`)

	if (
		pageSize !== 100
		|| totalPages !== Math.ceil(totalResults / pageSize)
		|| hasPrevious !== currentPage > 1
		|| hasNext !== currentPage < totalPages
	) throw invalidMetadata()

	return {
		players: extractDbPlayers(value).slice(0, 100),
		meta: { currentPage, pageSize, totalPages, totalResults, hasPrevious, hasNext }
	}
}

function integer(source: Record<string, unknown> | null, key: string, minimum: number): number {
	const value = getNumberField(source, key)
	if (value === null || !Number.isInteger(value) || value < minimum) throw invalidMetadata()
	return value
}

function invalidMetadata(): Error {
	return new Error(`Invalid player page metadata.`)
}
