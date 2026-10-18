import type { PlayerEntry } from "$lib/core";
import { getServerDisplayName } from "./displayNames";
import { isMainMenuObservation } from '../../../../shared/gameState'
import { get } from 'svelte/store'
import { currentServer } from '$lib/gameState/currentServerStore'
import type { CurrentServerState } from '$lib/gameState/currentServerState'

export type ServerPlayersResult = {
	players: PlayerEntry[];
	externalId: string | null;
	serverName: string;
	serverAddress: string | null;
	normalizedServerName: string | null;
	serverDisplayName: string;
	parseWarnings: string[];
};

class ServerPlayersError extends Error {
	constructor(message: string, readonly code: string | null) {
		super(message)
	}
}

export function isGameMainMenu(serverRawName: string, playerCount: number): boolean {
	return isMainMenuObservation(serverRawName, playerCount)
}

export function isGameNotRunningError(error: unknown): boolean {
	return error instanceof ServerPlayersError && error.code === `GAME_NOT_RUNNING`
}

export async function fetchServerPlayers(readCurrent: () => Pick<CurrentServerState, `snapshot` | `players`> = () => get(currentServer)): Promise<ServerPlayersResult> {
	const current = readCurrent()
	const snapshot = current.snapshot
	if (!snapshot) {
		throw new ServerPlayersError(`No current game snapshot is available.`, `GAME_NOT_RUNNING`)
	}

	const serverName = snapshot.serverName?.trim() || "Current game server";
	return {
		players: current.players.map(player => ({ ...player })),
		externalId: snapshot.externalId,
		serverName,
		serverAddress: snapshot.serverAddress,
		normalizedServerName: null,
		serverDisplayName: getServerDisplayName(serverName),
		parseWarnings: [...snapshot.parseWarnings],
	};
}

export function getServerAvailabilityNotice(
	serverName: string,
	players: PlayerEntry[],
	hasRequestError = false,
): string {
	const isMainMenu = isGameMainMenu(serverName, players.length)
	return hasRequestError || isMainMenu ? "You're not in a server, or the game is not running." : "";
}
