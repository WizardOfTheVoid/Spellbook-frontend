import type { PlayerAction, PlayerDbProfile } from "$lib/core";
import type { PlayerState } from "$lib/types/playerState";
import type { Tone } from "$lib/types/tone";
import {
	formatDateTime,
	formatFullDateTime,
	formatHours,
	formatMetric,
	formatRelativeDateTime,
} from "$lib/utils/playerUtils";

export type TileItem = {
	title: string;
	subtitle?: string;
	value?: string | null;
	icon: string;
	iconTone: Tone;
	tone?: Tone;
	tooltip?: string | null;
};

export function buildCurrentGameItems(player: PlayerState): TileItem[] {
	return [
		{
			title: "Kills",
			subtitle: formatMetric(player.kills),
			icon: "fa-crosshairs",
			iconTone: "success",
		},
		{
			title: "Deaths",
			subtitle: formatMetric(player.deaths),
			icon: "fa-skull",
			iconTone: "danger",
		},
		{
			title: "Ping",
			subtitle: `${formatMetric(player.pingMs)} ms`,
			icon: "fa-network-wired",
			iconTone: "accent",
		},
	];
}

export function buildMetaItems(
	dbProfile: PlayerDbProfile | null,
	playerActions: PlayerAction[],
	banActions: PlayerAction[],
	nicknames: string[],
	playFabLoading = false,
): TileItem[] {
	const statistics = dbProfile?.player.playfab.statistics;
	const lastLoginAt = statistics?.lastLoginAt;
	const offenseCount = playerActions.filter((action) => action.actionType !== "unban").length;

	return [
		{
			title: "Total bans",
			subtitle: countLabel(banActions.length, "time", "times"),
			icon: "fa-ban",
			iconTone: "info",
		},
		{
			title: "Last banned",
			subtitle:
				banActions[0]?.createdAt ?
					formatDateTime(banActions[0].createdAt)
				:	"No recent ban",
			icon: "fa-clock",
			iconTone: "info",
		},
		{
			title: "Total offenses",
			subtitle: countLabel(offenseCount, "time", "times"),
			icon: "fa-flag",
			iconTone: "info",
		},
		{
			title: "Nicknames",
			subtitle: `${nicknames.length} names in history`,
			icon: "fa-tags",
			iconTone: "info",
		},
		{
			title: "Account created",
			subtitle: playFabLoading ? "Loading..." : formatFullDateTime(dbProfile?.player.playfab.account?.accountCreatedAt),
			icon: "fa-calendar-plus",
			iconTone: "info",
		},
		{
			title: "Rank",
			subtitle: playFabLoading ? "Loading..." : formatMetric(statistics?.rank),
			icon: "fa-ranking-star",
			iconTone: "info",
		},
		{
			title: "Last login",
			subtitle: playFabLoading ? "Loading..." : formatRelativeDateTime(lastLoginAt),
			tooltip: playFabLoading ? null : lastLoginAt ? formatFullDateTime(lastLoginAt) : null,
			icon: "fa-right-to-bracket",
			iconTone: "info",
		},
		{
			title: "Playtime",
			subtitle: playFabLoading ? "Loading..." : formatHours(statistics?.playtimeHours),
			icon: "fa-hourglass-half",
			iconTone: "info",
		},
	];
}

export function buildNicknameItems(nicknames: string[], limit = 4): TileItem[] {
	return nicknames.slice(0, limit).map((nickname) => ({
		title: nickname,
		subtitle: "Known name",
		icon: "fa-user-tag",
		iconTone: "info" as Tone,
	}));
}

function countLabel(count: number, singular: string, plural: string): string {
	return `${count} ${count === 1 ? singular : plural}`;
}
