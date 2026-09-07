import type { ActiveServerProfile, PlayerDbProfile, PlayerEntry } from "$lib/core";
import type { PlayerState } from "$lib/types/playerState";
import { mergePlayerState } from "$lib/utils/playerStateData";
import {
	fetchActiveServerProfile,
	fetchPlayerProfile,
} from "$lib/utils/serverProfilesApi";
import { fetchServerPlayers } from "$lib/utils/serverPlayersApi";

export type PlayerProfileSnapshot = {
	player: PlayerState | null;
	dbProfile: PlayerDbProfile | null;
	serverExternalId: string | null;
	serverName: string | null;
	serverAddress: string | null;
	profileError: string | null;
};

export type PlayerProfileServerContext = Pick<
	PlayerProfileSnapshot,
	`serverExternalId` | `serverName` | `serverAddress`
>

/** Pulls the live snapshot and the DB profile for one player and merges them. */
export async function loadPlayerProfileSnapshot(
	current: PlayerState,
	context: PlayerProfileServerContext = {
		serverExternalId: null,
		serverName: null,
		serverAddress: null,
	},
): Promise<PlayerProfileSnapshot> {
	const playfabId = current.playfabId;
	let dbPlayer = current.dbPlayer;
	let livePlayer: PlayerEntry | null = current.livePlayer;
	let serverExternalId = context.serverExternalId;
	let serverName = context.serverName;
	let serverAddress = context.serverAddress;
	const [liveSnapshot, storedProfile] = await Promise.allSettled([
		fetchServerPlayers(),
		fetchPlayerProfile(playfabId),
	])

	if (liveSnapshot.status === `fulfilled`) {
		const liveResult = liveSnapshot.value
		serverExternalId = liveResult.externalId;
		serverName = liveResult.serverName;
		serverAddress = liveResult.serverAddress;
		livePlayer =
			liveResult.players.find((candidate) => candidate.playfabId === playfabId) ?? null;
	}

	let dbProfile: PlayerDbProfile | null = null;
	let profileError: string | null = null;
	if (storedProfile.status === `fulfilled`) {
		dbProfile = storedProfile.value
		dbPlayer = dbProfile.player;
	} else {
		const error = storedProfile.reason
		profileError =
			error instanceof Error ? error.message : "Player profile request failed.";
	}

	return {
		player: livePlayer || dbPlayer ? mergePlayerState(livePlayer, dbPlayer) : null,
		dbProfile,
		serverExternalId,
		serverName,
		serverAddress,
		profileError,
	};
}

export function loadPlayerProfileActionContext(
	serverExternalId: string | null,
): Promise<ActiveServerProfile> {
	return fetchActiveServerProfile(serverExternalId)
}
