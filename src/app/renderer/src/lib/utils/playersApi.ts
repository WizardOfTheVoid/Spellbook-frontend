import { getServerApi, type DbPlayerListItem, type PlayerListQuery } from '$lib/core'
import { playerEnrichmentBatchSize, type PlayerEnrichmentResult } from '@spellbook/shared/playerEnrichment.js'
import { unwrap } from './apiResult'
import { extractDbPlayers } from './dbPlayers'
import { getNumberField, getRecordField, isRecord } from './records'

export type PlayerListMeta = {
	currentPage: number
	pageSize: 100
	totalPages: number | null
	totalResults: number | null
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

export async function enrichPlayers(playfabIds: string[]): Promise<number[]> {
  const enriched: number[] = []
  const ids = [...new Set(playfabIds)]
  for (let offset = 0; offset < ids.length; offset += playerEnrichmentBatchSize) {
    const result = await unwrap<PlayerEnrichmentResult>(
      await getServerApi().enrichPlayers(ids.slice(offset, offset + playerEnrichmentBatchSize)),
      `Player XP enrichment failed.`
    )
    enriched.push(...result.enrichedPlayerIds)
  }
  return enriched
}

export function parsePlayerPage(value: unknown): PlayerPage {
	if (!isRecord(value) || !Array.isArray(value.players)) throw invalidMetadata()
	const meta = getRecordField(value, `meta`)
	const currentPage = integer(meta, `currentPage`, 1)
	const pageSize = integer(meta, `pageSize`, 100)
	const totalPages = meta?.totalPages === null ? null : integer(meta, `totalPages`, 0)
	const totalResults = meta?.totalResults === null ? null : integer(meta, `totalResults`, 0)
	const hasPrevious = meta?.hasPrevious
	const hasNext = meta?.hasNext

	if (
		pageSize !== 100
		|| typeof hasPrevious !== `boolean`
		|| typeof hasNext !== `boolean`
		|| (totalPages === null) !== (totalResults === null)
		|| hasPrevious !== currentPage > 1
		|| (totalPages !== null && totalResults !== null && (
			totalPages !== Math.ceil(totalResults / pageSize)
			|| hasNext !== currentPage < totalPages
		))
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
