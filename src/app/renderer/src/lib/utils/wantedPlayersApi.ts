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

export type WantedDisplayMeta = {
	scope: string
	reason: string
	offenseType: string
	duration: string
	author: string
	actionType: string
	origin: string
	coverage: string
}

export async function getWantedPlayers(query: PlayerListQuery = {}): Promise<WantedPlayerPage> {
	const data = await unwrap<unknown>(
		await getServerApi().getWantedPlayers(query),
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

export function getWantedDisplayMeta(
	wanted: WantedPlayerListItem[`wanted`]
): WantedDisplayMeta {
	return {
		scope: wanted.scope ? title(wanted.scope) : `Scope unavailable`,
		reason: wanted.reason?.trim() || `Reason unavailable`,
		offenseType: wanted.offenseType
			? title(wanted.offenseType.replaceAll(`_`, ` `))
			: `Offense unavailable`,
		duration: wanted.duration === null && wanted.actionType === `ban`
			? `Permanent`
			: wanted.duration === null
				? `Unavailable`
				: `${wanted.duration} hours`,
		author: wanted.author?.username?.trim()
			|| wanted.author?.playfabId?.trim()
			|| `Author unavailable`,
		actionType: wanted.actionType ? title(wanted.actionType) : `Action unavailable`,
		origin: wanted.originServer?.displayName?.trim()
			|| wanted.originServer?.name?.trim()
			|| (wanted.originServer ? `#${wanted.originServer.id}` : `Origin unavailable`),
		coverage: wanted.actionType === `unban` && wanted.targetServerCount !== null
			? `${wanted.completedServerCount}/${wanted.targetServerCount} reverted`
			: wanted.actionType === `ban` || wanted.actionType === `mock`
				? `${wanted.completedServerCount} ${wanted.completedServerCount === 1 ? `server` : `servers`} reached`
				: `Coverage unavailable`,
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

function title(value: string): string {
	return value.charAt(0).toUpperCase() + value.slice(1)
}
