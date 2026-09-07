import {
	getServerApi,
	type PlayerAction,
} from '$lib/core'
import { unwrap } from '$lib/utils/apiResult'
import { isRecord, type JsonRecord } from './records'

const pageSize = 200
const actionTypes = [`ban`, `kick`, `warn`, `mute`, `unban`, `mock`] as const
const offenseTypes = [
	`hacker`, `ffa`, `verbal_abuse`, `griefing`, `exploiting`, `toxic_behavior`,
	`low_level`, `votekick_abuse`, `other`,
] as const
const actionScopes = [`local`, `global`] as const
const creationTypes = [`manual`, `auto`] as const

export async function fetchAllPlayerActions(playerId: number): Promise<PlayerAction[]> {
	const actions: PlayerAction[] = []

	for (let offset = 0; ; offset += pageSize) {
		const value = await unwrap<unknown>(
			await getServerApi().playerActions.list(playerId, pageSize, offset),
			`Player actions request failed.`,
		)
		const page = parsePlayerActions(value)
		actions.push(...page)
		if (page.length < pageSize) return actions
	}
}

export function parsePlayerAction(value: unknown): PlayerAction {
	try {
		if (!isRecord(value)) throw new Error()
		const author = record(value.author)
		const gameServer = value.gameServer === null ? null : record(value.gameServer)

		return {
			id: positiveInteger(value.id),
			playerId: positiveInteger(value.playerId),
			gameServerId: nullablePositiveInteger(value.gameServerId),
			authorId: positiveInteger(value.authorId),
			actionType: enumValue(value.actionType, actionTypes),
			offenseType: nullableEnum(value.offenseType, offenseTypes),
			duration: nullableNumber(value.duration),
			reason: nullableString(value.reason),
			scope: enumValue(value.scope, actionScopes),
			relatedActionId: nullablePositiveInteger(value.relatedActionId),
			autoban: boolean(value.autoban),
			creationType: value.creationType === undefined ? `auto` : enumValue(value.creationType, creationTypes),
			originalActionId: nullablePositiveInteger(value.originalActionId),
			expiresAt: nullableString(value.expiresAt),
			createdAt: requiredString(value.createdAt),
			updatedAt: requiredString(value.updatedAt),
			author: {
				id: positiveInteger(author.id),
				username: nullableString(author.username),
				playfabId: nullableString(author.playfabId),
			},
			gameServer: gameServer === null ? null : {
				id: positiveInteger(gameServer.id),
				name: nullableString(gameServer.name),
				displayName: nullableString(gameServer.displayName),
			},
		}
	} catch {
		throw invalidPlayerAction()
	}
}

function parsePlayerActions(value: unknown): PlayerAction[] {
	if (!Array.isArray(value)) throw invalidPlayerAction()
	return value.map(parsePlayerAction)
}

function record(value: unknown): JsonRecord {
	if (!isRecord(value)) throw new Error()
	return value
}

function positiveInteger(value: unknown): number {
	if (typeof value !== `number` || !Number.isSafeInteger(value) || value < 1) throw new Error()
	return value
}

function nullablePositiveInteger(value: unknown): number | null {
	return value === null ? null : positiveInteger(value)
}

function nullableNumber(value: unknown): number | null {
	if (value === null) return null
	if (typeof value !== `number` || !Number.isFinite(value)) throw new Error()
	return value
}

function boolean(value: unknown): boolean {
	if (typeof value !== `boolean`) throw new Error()
	return value
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

function enumValue<const T extends readonly string[]>(value: unknown, allowed: T): T[number] {
	if (typeof value !== `string` || !allowed.includes(value)) throw new Error()
	return value as T[number]
}

function nullableEnum<const T extends readonly string[]>(value: unknown, allowed: T): T[number] | null {
	return value === null ? null : enumValue(value, allowed)
}

function invalidPlayerAction(): Error {
	return new Error(`Invalid player action data.`)
}
