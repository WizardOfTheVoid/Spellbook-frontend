import type { PlayerState } from "$lib/types/playerState";
import type { FilterChip } from "$lib/types/ui";

export const PLAYER_FILTER_CHIPS: FilterChip[] = [
	{
		id: "low-rank",
		label: "Low rank",
		icon: "fa-circle-user",
		tooltip: "Players ranked 100 or lower.",
	},
	{
		id: "active",
		label: "Active",
		icon: "fa-clock",
		tooltip: "Players seen within the last two weeks.",
	},
	{
		id: "new-accounts",
		label: "New",
		icon: "fa-user-plus",
		tooltip: "Accounts created within the last seven days.",
	},
	{
		id: "banned",
		label: "Banned",
		icon: "fa-ban",
		tooltip: "Players with a ban active right now.",
	},
	{
		id: "online",
		label: "Online",
		icon: "fa-circle-check",
		disabled: true,
		tooltip: "Online filtering is WIP.",
	},
	{
		id: "non-eu",
		label: "Non-EU",
		icon: "fa-globe",
		tooltip: "Live players with 120 ms ping or higher.",
	},
	{
		id: "priors",
		label: "Priors",
		icon: "fa-gavel",
		tooltip: "Players with at least one recorded offense.",
	},
];

export function getPlayerFilterChips(mode: "database" | "live"): FilterChip[] {
	const unavailableId = mode === "live" ? "online" : "non-eu"
	return PLAYER_FILTER_CHIPS.filter(({ id }) => id !== unavailableId)
}

export const LOW_RANK_MAX = 100;
const NON_EU_PING_MS = 120;

const predicates: Record<string, (player: PlayerState) => boolean> = {
	"non-eu": (player) => (player.pingMs ?? 0) >= NON_EU_PING_MS,
};

export function applyLocalPlayerFilters(
	players: PlayerState[],
	activeChipIds: string[],
): PlayerState[] {
	if (activeChipIds.length === 0) return players;

	return players.filter((player) =>
		activeChipIds.every((id) => predicates[id]?.(player) ?? true),
	);
}

export function togglePlayerFilter(activeChipIds: string[], id: string): string[] {
	return activeChipIds.includes(id) ?
			activeChipIds.filter((entry) => entry !== id)
		:	[...activeChipIds, id];
}
