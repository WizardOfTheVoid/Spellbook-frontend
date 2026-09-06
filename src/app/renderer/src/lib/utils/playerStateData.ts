import type { DbPlayerListItem, PlayerEntry } from "$lib/core";
import type { PlayerState } from "$lib/types/playerState";

export function mergeLivePlayersWithDb(
	livePlayers: PlayerEntry[],
	dbPlayers: DbPlayerListItem[],
): PlayerState[] {
	const livePlayersByPlayfabId = new Map(
		livePlayers.map((player) => [player.playfabId, player]),
	);

	return dbPlayers.flatMap((dbPlayer) => {
		const livePlayer = livePlayersByPlayfabId.get(dbPlayer.playfabId)
		return livePlayer ? [mergePlayerState(livePlayer, dbPlayer)] : []
	})
}

export function createDbPlayerState(dbPlayer: DbPlayerListItem): PlayerState {
	return mergePlayerState(null, dbPlayer);
}

export function mergePlayerState(
	livePlayer: PlayerEntry | null,
	dbPlayer: DbPlayerListItem | null,
): PlayerState {
	if (!livePlayer && !dbPlayer) {
		throw new Error("Player state requires DB or live player data.");
	}

	const playfabId = livePlayer?.playfabId ?? dbPlayer?.playfabId ?? "";
	const dbName = hasText(dbPlayer?.latestName) ? dbPlayer.latestName : "Unknown player";
	const name = hasText(livePlayer?.name) ? livePlayer.name : dbName;
	const normalizedName = dbPlayer?.latestNormalizedName?.trim() || null;

	return {
		index: livePlayer?.index ?? dbPlayer?.id ?? 0,
		name,
		normalizedName,
		playfabId,
		rawLine: livePlayer?.rawLine ?? `${name} ${playfabId}`,
		eosPlayerId: livePlayer?.eosPlayerId ?? null,
		score: livePlayer?.score ?? null,
		rank: dbPlayer?.rank ?? livePlayer?.rank ?? null,
		kills: livePlayer?.kills ?? null,
		deaths: livePlayer?.deaths ?? null,
		pingMs: livePlayer?.pingMs ?? null,
		livePlayer,
		dbPlayer,
		isLive: livePlayer !== null,
		dbId: dbPlayer?.id ?? null,
		dbLatestName: dbPlayer?.latestName ?? null,
		dbLatestNormalizedName: dbPlayer?.latestNormalizedName ?? null,
		isOnline: livePlayer !== null || dbPlayer?.isOnline === true,
		lastLogin: dbPlayer?.lastLogin ?? null,
		playtimeHours: dbPlayer?.playtimeHours ?? null,
		activeBanKind: dbPlayer?.activeBanKind ?? null,
		lastSeen: dbPlayer?.lastSeen ?? null,
		createdAt: dbPlayer?.createdAt ?? null,
		updatedAt: dbPlayer?.updatedAt ?? null,
	};
}

function hasText(value: string | null | undefined): value is string {
	return typeof value === `string` && value.trim().length > 0
}
