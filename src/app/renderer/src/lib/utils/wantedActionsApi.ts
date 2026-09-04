import {
	extractEnvelope,
	getServerApi,
	type DbPlayerListItem,
	type WantedCreateInput,
	type WantedDetail,
} from '$lib/core'
import { unwrap } from './apiResult'
import { parsePlayerAction } from './playerActionsApi'
import { isRecord, type JsonRecord } from './records'

export async function getWantedPlayer(playerId: number): Promise<WantedDetail | null> {
	const result = await getServerApi().wanted.get(playerId)
	if (result.status === 404
		&& result.ok === false
		&& extractEnvelope<unknown>(result)?.error?.code === `WANTED_NOT_FOUND`) return null
	return parseWantedDetail(await unwrap<unknown>(result, `Wanted detail request failed.`))
}

export async function createWantedPlayer(input: WantedCreateInput): Promise<WantedDetail> {
	const value = await unwrap<unknown>(
		await getServerApi().wanted.create(input),
		`Wanted creation failed.`,
	)
	return parseWantedDetail(value)
}

export async function revertWantedPlayer(playerId: number, sourceActionId: number): Promise<WantedDetail> {
	const value = await unwrap<unknown>(
		await getServerApi().wanted.revert(playerId, sourceActionId),
		`Wanted revert failed.`,
	)
	return parseWantedDetail(value)
}

export async function removeWantedPlayer(playerId: number): Promise<void> {
	await unwrap<unknown>(
		await getServerApi().wanted.remove(playerId),
		`Wanted removal failed.`,
	)
}

export function parseWantedDetail(value: unknown): WantedDetail {
	try {
		if (!isRecord(value)) throw new Error()
		const wanted = record(value.wanted)
		if (!Array.isArray(value.automaticActions)
			|| !Array.isArray(value.targetActions)
			|| !Array.isArray(value.targetServerIds)
			|| typeof value.noteCount !== `number`
			|| typeof value.canRevert !== `boolean`
			|| typeof value.canRemove !== `boolean`) {
			throw new Error()
		}

		return {
			wanted: {
				id: positiveInteger(wanted.id),
				playerId: positiveInteger(wanted.playerId),
				originalActionId: nullablePositiveInteger(wanted.originalActionId),
				deletedAt: nullableString(wanted.deletedAt),
			},
			player: parsePlayer(value.player),
			sourceAction: value.sourceAction === null ? null : parsePlayerAction(value.sourceAction),
			automaticActions: value.automaticActions.map(parsePlayerAction),
			targetActions: value.targetActions.map(parsePlayerAction),
			targetServerIds: value.targetServerIds.map(positiveInteger),
			noteCount: nonNegativeInteger(value.noteCount),
			canRevert: value.canRevert,
			canRemove: value.canRemove,
		}
	} catch {
		throw new Error(`Invalid wanted detail data.`)
	}
}

function parsePlayer(value: unknown): DbPlayerListItem {
	const player = record(value)
	if (typeof player.isOnline !== `boolean`) throw new Error()
	return {
		id: positiveInteger(player.id),
		playfabId: requiredString(player.playfabId),
		latestName: nullableString(player.latestName),
		latestNormalizedName: nullableString(player.latestNormalizedName),
		lastLogin: null,
		playtimeHours: null,
		activeBanKind: null,
		isOnline: player.isOnline,
		lastSeen: nullableString(player.lastSeen),
		createdAt: nullableString(player.createdAt),
		updatedAt: nullableString(player.updatedAt),
	}
}

function record(value: unknown): JsonRecord {
	if (!isRecord(value)) throw new Error()
	return value
}

function positiveInteger(value: unknown): number {
	if (typeof value !== `number` || !Number.isSafeInteger(value) || value < 1) throw new Error()
	return value
}

function nonNegativeInteger(value: unknown): number {
	if (typeof value !== `number` || !Number.isSafeInteger(value) || value < 0) throw new Error()
	return value
}

function nullablePositiveInteger(value: unknown): number | null {
	return value === null ? null : positiveInteger(value)
}

function requiredString(value: unknown): string {
	if (typeof value !== `string` || value.length < 1) throw new Error()
	return value
}

function nullableString(value: unknown): string | null {
	if (value === null) return null
	if (typeof value !== `string`) throw new Error()
	return value
}
