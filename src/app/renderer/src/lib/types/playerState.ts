import type { ActiveBanKind, DbPlayerListItem, PlayerEntry } from "$lib/core";

export type PlayerState = PlayerEntry & {
	normalizedName: string | null;
	livePlayer: PlayerEntry | null;
	dbPlayer: DbPlayerListItem | null;
	isLive: boolean;
	dbId: number | null;
	dbLatestName: string | null;
	dbLatestNormalizedName: string | null;
	isOnline: boolean;
	lastLogin: string | null
	playtimeHours: number | null
	activeBanKind: ActiveBanKind | null
	lastSeen?: string | null;
	createdAt?: string | null;
	updatedAt?: string | null;
};
