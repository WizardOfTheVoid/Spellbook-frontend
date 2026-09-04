import type { DbPlayerListItem } from "$lib/core";
import {
	getBooleanField,
	getNumberField,
	getStringField,
	isRecord,
} from "./records";

export function extractDbPlayers(value: unknown): DbPlayerListItem[] {
	const source =
		isRecord(value) && Array.isArray(value.players) ? value.players : value;

	if (!Array.isArray(source)) {
		return [];
	}

	return source
		.map(normalizeDbPlayer)
		.filter((player): player is DbPlayerListItem => player !== null);
}

function normalizeDbPlayer(value: unknown): DbPlayerListItem | null {
	if (!isRecord(value)) {
		return null;
	}

	const id = getNumberField(value, "id") ?? getNumberField(value, "Id");
	const playfabId =
		getStringField(value, "playfabId") ?? getStringField(value, "PlayfabId");
	const activeBanKind =
		getStringField(value, "activeBanKind") ??
		getStringField(value, "ActiveBanKind")

	if (!id || !playfabId) {
		return null;
	}

	return {
		id,
		playfabId,
		rank: getNumberField(value, "rank") ?? getNumberField(value, "Rank"),
		latestName:
			getStringField(value, "latestName") ??
			getStringField(value, "LatestName"),
		latestNormalizedName:
			getStringField(value, "latestNormalizedName") ??
			getStringField(value, "LatestNormalizedName"),
		lastLogin:
			getStringField(value, "lastLogin") ??
			getStringField(value, "LastLogin"),
		playtimeHours:
			getNumberField(value, "playtimeHours") ??
			getNumberField(value, "PlaytimeHours"),
		activeBanKind:
			activeBanKind === "hacker" || activeBanKind === "other"
				? activeBanKind
				: null,
		isOnline:
			getBooleanField(value, "isOnline") ??
			getBooleanField(value, "IsOnline") ??
			false,
		lastSeen:
			getStringField(value, "lastSeen") ?? getStringField(value, "LastSeen"),
		createdAt:
			getStringField(value, "createdAt") ?? getStringField(value, "CreatedAt"),
		updatedAt:
			getStringField(value, "updatedAt") ?? getStringField(value, "UpdatedAt"),
	};
}
