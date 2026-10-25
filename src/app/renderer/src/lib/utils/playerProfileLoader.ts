import type { ActiveServerProfile, PlayerDbProfile, PlayerEntry } from "$lib/core";
import type { PlayerState } from "$lib/types/playerState";
import { mergePlayerState } from "$lib/utils/playerStateData";
import {
	fetchActiveServerProfile,
	fetchPlayerProfile,
} from "$lib/utils/serverProfilesApi";
import { get } from 'svelte/store'
import { currentServer } from '$lib/gameState/currentServerStore'

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

export function mergePlayerProfileLiveState(current: PlayerState, players: readonly PlayerState[], isOnline = current.isOnline): PlayerState {
	const live = players.find(player => player.playfabId === current.playfabId && player.isLive)
	const livePlayer = live?.livePlayer ?? null
	const merged = livePlayer || current.dbPlayer ? mergePlayerState(livePlayer, current.dbPlayer) : {
		...current, livePlayer: null, isLive: false, score: null, kills: null, deaths: null, pingMs: null
	}
	return { ...merged, isOnline: live?.isOnline ?? isOnline }
}

export async function loadPlayerProfileSnapshot(
	current: PlayerState,
	context: PlayerProfileServerContext = {
		serverExternalId: null,
		serverName: null,
		serverAddress: null,
	},
	visit = false,
	localState = () => get(currentServer),
): Promise<PlayerProfileSnapshot> {
	const playfabId = current.playfabId;
	let dbPlayer = current.dbPlayer;
	let livePlayer: PlayerEntry | null = current.livePlayer;
	const local = localState()
	const serverExternalId = local.snapshot?.externalId ?? null
	const serverName = local.snapshot?.serverName ?? null
	const serverAddress = local.snapshot?.serverAddress ?? null
	livePlayer = local.players.find(player => player.playfabId === playfabId && player.isLive)?.livePlayer ?? null
	const [storedProfile] = await Promise.allSettled([fetchPlayerProfile(playfabId, visit)])

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
		player: livePlayer || dbPlayer ? { ...mergePlayerState(livePlayer, dbPlayer, dbProfile?.presence?.isOnline === true),
			isOnline: dbProfile?.presence?.isOnline ?? dbPlayer?.isOnline ?? false } : null,
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
