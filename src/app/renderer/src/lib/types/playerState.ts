import type { ActiveBanKind, DbPlayerListItem, PlayerEntry } from "$lib/core";

export type PlayerState = PlayerEntry & {
  liveKey?: string
  identity?: `listplayers` | `inferred` | `unknown`
  durationSeconds?: number | null
  durationObservedAt?: string | null
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
	activeBan?: DbPlayerListItem[`activeBan`]
	latestPunishment?: DbPlayerListItem[`latestPunishment`]
	strongestRecentPunishment?: DbPlayerListItem[`strongestRecentPunishment`]
	lastSeen?: string | null;
	createdAt?: string | null;
	updatedAt?: string | null;
};
