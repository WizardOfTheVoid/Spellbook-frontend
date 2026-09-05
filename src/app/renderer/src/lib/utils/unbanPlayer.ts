import {
	extractEnvelope,
	getCoreApi,
	getCoreErrorMessage,
	getServerApi,
	type CoreCallResult,
	type RecordUnbanByPlayfabInput,
} from '$lib/core'
import { unwrap } from './apiResult'
import { fetchActiveServerProfile } from './serverProfilesApi'
import { getWantedPlayer } from './wantedActionsApi'
import {
	fetchServerPlayers,
	isGameMainMenu,
	type ServerPlayersResult,
} from './serverPlayersApi'

export type UnbanPlayerInput = {
	playerId: number
	playfabId: string
	playerName?: string | null
	actionId?: number
}

export type UnbanPlayerResult = {
	ok: boolean
	message: string
	auditFailed?: true
}

export type RelatedUnbanAuditInput = {
	playerId: number
	actionId: number
	gameServerId: number
}

export type UnbanPlayerDependencies = {
	fetchWanted: (playerId: number) => Promise<unknown>
	resolveCurrentGameServerId: () => Promise<number | null>
	coreUnban: (playfabId: string) => Promise<CoreCallResult>
	recordRelatedUnban: (input: RelatedUnbanAuditInput) => Promise<void>
	recordUnrelatedUnban: (input: RecordUnbanByPlayfabInput) => Promise<void>
}

export async function unbanPlayer(
	input: UnbanPlayerInput,
	dependencies: UnbanPlayerDependencies = defaultDependencies(),
): Promise<UnbanPlayerResult> {
	try {
		if (await dependencies.fetchWanted(input.playerId)) {
			return { ok: false, message: `Wanted actions must be changed from the Wanted page.` }
		}
	} catch (error) {
		return { ok: false, message: errorMessage(error, `Wanted status could not be checked.`) }
	}

	let gameServerId: number | null
	try {
		gameServerId = await dependencies.resolveCurrentGameServerId()
	} catch (error) {
		return { ok: false, message: errorMessage(error, `Current server could not be resolved.`) }
	}

	if (typeof gameServerId !== `number` || !Number.isInteger(gameServerId) || gameServerId < 1) {
		return { ok: false, message: `Current server was not resolved.` }
	}

	let coreResult: CoreCallResult
	try {
		coreResult = await dependencies.coreUnban(input.playfabId)
	} catch (error) {
		return { ok: false, message: errorMessage(error, `Unban failed.`) }
	}

	if (!isOk(coreResult)) {
		return { ok: false, message: getCoreErrorMessage(coreResult, `Unban failed.`) }
	}

	try {
		if (input.actionId === undefined) {
			await dependencies.recordUnrelatedUnban({
				playfabId: input.playfabId,
				playerName: input.playerName,
				gameServerId,
			})
		} else {
			await dependencies.recordRelatedUnban({
				playerId: input.playerId,
				actionId: input.actionId,
				gameServerId,
			})
		}
	} catch (error) {
		return {
			ok: false,
			message: `Command sent, but audit record failed${errorSuffix(error)}`,
			auditFailed: true,
		}
	}

	return { ok: true, message: `Player unbanned.` }
}

function defaultDependencies(): UnbanPlayerDependencies {
	return {
		fetchWanted: getWantedPlayer,
		resolveCurrentGameServerId,
		coreUnban: playfabId => getCoreApi().unban(playfabId),
		recordRelatedUnban: async ({ playerId, actionId, gameServerId }) => {
			await unwrap(
				await getServerApi().playerActions.unban(playerId, actionId, { gameServerId }),
				`Player unban audit failed.`,
			)
		},
		recordUnrelatedUnban: async input => {
			await unwrap(
				await getServerApi().recordUnbanByPlayfab(input),
				`Player unban audit failed.`,
			)
		},
	}
}

type CurrentServerSnapshot = Pick<ServerPlayersResult, `externalId` | `serverName` | `players`>
type CurrentServerProfile = {
	gameServer: { id: number; externalId: string } | null
}

export async function resolveCurrentGameServerId(
	fetchCurrentServer: () => Promise<CurrentServerSnapshot> = fetchServerPlayers,
	fetchProfile: (externalId: string) => Promise<CurrentServerProfile> = fetchActiveServerProfile,
): Promise<number | null> {
	const current = await fetchCurrentServer()
	const externalId = current.externalId?.trim()

	if (!externalId || isGameMainMenu(current.serverName, current.players.length)) return null

	const profile = await fetchProfile(externalId)
	if (profile.gameServer?.externalId !== externalId) return null
	return profile.gameServer.id
}

function isOk(result: CoreCallResult): boolean {
	return result.ok && extractEnvelope<unknown>(result)?.ok !== false
}

function errorSuffix(error: unknown): string {
	return error instanceof Error && error.message ? `: ${error.message}` : `.`
}

function errorMessage(error: unknown, fallback: string): string {
	return error instanceof Error && error.message ? error.message : fallback
}
