import {
	getCoreApi,
} from "$lib/core";
import type { PlayerEntry } from "$lib/core";
import { getServerDisplayName } from "./displayNames";

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

export function isMainMenuServerName(serverRawName: string): boolean {
	return serverRawName.trim().toLowerCase() === `hastings`
}

export function isGameMainMenu(serverRawName: string, playerCount: number): boolean {
	return isMainMenuServerName(serverRawName) && playerCount < 1
}

export function isGameNotRunningError(error: unknown): boolean {
	return error instanceof ServerPlayersError && error.code === `GAME_NOT_RUNNING`
}

export async function fetchServerPlayers(): Promise<ServerPlayersResult> {
	const snapshot = await getCoreApi().currentGameSnapshot()
	if (!snapshot) {
		throw new ServerPlayersError(`No current game snapshot is available.`, `GAME_NOT_RUNNING`)
	}

	const serverName = snapshot.serverName?.trim() || "Current game server";
	return {
		players: snapshot.players.map(player => ({ ...player })),
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
