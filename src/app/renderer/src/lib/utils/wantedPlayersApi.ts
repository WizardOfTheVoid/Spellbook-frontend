import type { PlayerSearchRequest } from '$lib/core'
import {
	getServerApi,
	type PlayerListQuery,
	type WantedPlayerListItem,
} from '$lib/core'
import { unwrap } from './apiResult'
import { extractDbPlayers } from './dbPlayers'
import { getRecordField, isRecord } from './records'
import { parsePlayerPage, type PlayerListMeta } from './playersApi'

export type WantedPlayerPage = {
	players: WantedPlayerListItem[]
	meta: PlayerListMeta
}

export async function getWantedPlayers(query: PlayerListQuery = {}, request?: PlayerSearchRequest): Promise<WantedPlayerPage> {
	const data = await unwrap<unknown>(
		await getServerApi().getWantedPlayers(query, request),
		`Wanted players request failed.`
	)
	return parseWantedPlayerPage(data)
}

export function parseWantedPlayerPage(value: unknown): WantedPlayerPage {
	const page = parsePlayerPage(value)
	if (!isRecord(value)) throw invalidWantedPlayer()
	const players = value.players
	if (!Array.isArray(players)) throw invalidWantedPlayer()

	return {
		players: players.flatMap(value => {
			const player = extractDbPlayers([value])[0]
			return player && isRecord(value) ? [{
				...player,
				banCount: nonNegativeInteger(value.banCount),
				noteCount: nonNegativeInteger(value.noteCount),
				wanted: parseWanted(getRecordField(value, `wanted`)),
			}] : []
		}).slice(0, 100),
		meta: page.meta,
	}
}

function parseWanted(value: Record<string, unknown> | null): WantedPlayerListItem[`wanted`] {
	try {
		if (!value) throw invalidWantedPlayer()
		const actionType = nullableEnum(value.actionType, [`ban`, `unban`, `mock`] as const)
		const targetServerCount = nullableNonNegativeInteger(value.targetServerCount)
		if ((actionType === `unban`) !== (targetServerCount !== null)) throw invalidWantedPlayer()
		return {
			scope: nullableEnum(value.scope, [`local`, `global`] as const),
			reason: nullableString(value.reason),
			offenseType: nullableOffense(value.offenseType),
			duration: nullableNumber(value.duration),
			author: parseAuthor(value.author),
			wantedAt: requiredString(value.wantedAt),
			originalActionId: nullablePositiveInteger(value.originalActionId),
			actionType,
			originServer: parseOriginServer(value.originServer),
			completedServerCount: nonNegativeInteger(value.completedServerCount),
			targetServerCount,
		}
	} catch {
		throw invalidWantedPlayer()
	}
}

function nullableOffense(value: unknown): WantedPlayerListItem[`wanted`][`offenseType`] {
	if (value === null) return null
	if (typeof value === `string` && [
		`hacker`,
		`ffa`,
		`verbal_abuse`,
		`griefing`,
		`exploiting`,
		`toxic_behavior`,
		`low_level`,
		`votekick_abuse`,
		`other`,
	].includes(value)) return value as WantedPlayerListItem[`wanted`][`offenseType`]
	throw invalidWantedPlayer()
}

function parseAuthor(value: unknown): WantedPlayerListItem[`wanted`][`author`] {
	if (value === null) return null
	if (!isRecord(value)) throw invalidWantedPlayer()
	return {
		id: positiveInteger(value.id),
		...(value.displayName === undefined ? {} : { displayName: nullableString(value.displayName) }),
		username: nullableString(value.username),
		playfabId: nullableString(value.playfabId),
	}
}

function parseOriginServer(value: unknown): WantedPlayerListItem[`wanted`][`originServer`] {
	if (value === null) return null
	if (!isRecord(value)) throw invalidWantedPlayer()
	return {
		id: positiveInteger(value.id),
		name: nullableString(value.name),
		displayName: nullableString(value.displayName),
	}
}

function positiveInteger(value: unknown): number {
	if (typeof value !== `number` || !Number.isSafeInteger(value) || value < 1) throw invalidWantedPlayer()
	return value
}

function nonNegativeInteger(value: unknown): number {
	if (typeof value !== `number` || !Number.isSafeInteger(value) || value < 0) throw invalidWantedPlayer()
	return value
}

function nullablePositiveInteger(value: unknown): number | null {
	return value === null ? null : positiveInteger(value)
}

function nullableNonNegativeInteger(value: unknown): number | null {
	return value === null ? null : nonNegativeInteger(value)
}

function nullableNumber(value: unknown): number | null {
	if (value === null) return null
	if (typeof value !== `number` || !Number.isFinite(value)) throw invalidWantedPlayer()
	return value
}

function requiredString(value: unknown): string {
	if (typeof value !== `string` || value.length < 1) throw invalidWantedPlayer()
	return value
}

function nullableString(value: unknown): string | null {
	if (value === null) return null
	if (typeof value !== `string`) throw invalidWantedPlayer()
	return value
}

function nullableEnum<const T extends readonly string[]>(value: unknown, allowed: T): T[number] | null {
	if (value === null) return null
	if (typeof value !== `string` || !(allowed as readonly string[]).includes(value)) throw invalidWantedPlayer()
	return value as T[number]
}

function invalidWantedPlayer(): Error {
	return new Error(`Invalid wanted player data.`)
}
