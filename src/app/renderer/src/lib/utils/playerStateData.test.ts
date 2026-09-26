import assert from "node:assert/strict";
import test from "node:test";
import type { DbPlayerListItem, PlayerEntry } from "$lib/core";
import {
	createDbPlayerState,
	mergeLivePlayersWithDb,
	mergePlayerState,
} from "./playerStateData";
import { getPlayerDisplayName } from "./displayNames";

test("live player uses the backend normalized nickname", () => {
	const state = mergePlayerState(
		livePlayer("Live Name", "P1"),
		dbPlayer("P1", "Database Name", "Database Normalized"),
	);

	assert.equal(state.name, "Live Name");
	assert.equal(state.normalizedName, "Database Normalized");
	assert.equal(state.dbLatestName, "Database Name");
});

test("database nickname is used when live data is absent", () => {
	const state = createDbPlayerState(
		dbPlayer("P1", "Database Name", "Database Normalized", {
			lastLogin: "2026-07-30T12:34:56.789Z",
			playtimeHours: 123.5,
			activeBanKind: "other",
		}),
	);

	assert.equal(state.name, "Database Name");
	assert.equal(state.normalizedName, "Database Normalized");
	assert.equal(state.isLive, false);
	assert.equal(state.kills, null);
	assert.equal(state.lastLogin, "2026-07-30T12:34:56.789Z");
	assert.equal(state.playtimeHours, 123.5);
	assert.equal(state.activeBanKind, "other");
});

test("live stats are attached to database player state", () => {
	const storedPlayer = {
		...dbPlayer("P1", "Database Name", "Database Normalized", {
			lastLogin: "2026-07-30T12:34:56.789Z",
			playtimeHours: 42,
			activeBanKind: "hacker",
		}),
		rank: 55,
	};
	const state = mergeLivePlayersWithDb(
		[livePlayer("Live Name", "P1", { kills: 7, deaths: 2, pingMs: 44 })],
		[storedPlayer],
	)[0];

	assert.equal(state.rank, 55);
	assert.equal(state.kills, 7);
	assert.equal(state.deaths, 2);
	assert.equal(state.pingMs, 44);
	assert.equal(state.dbPlayer?.latestName, "Database Name");
	assert.equal(state.isOnline, true);
	assert.equal(state.lastLogin, "2026-07-30T12:34:56.789Z");
	assert.equal(state.playtimeHours, 42);
	assert.equal(state.activeBanKind, "hacker");
});

test("live player merge keeps only backend-returned IDs and original live names", () => {
	const states = mergeLivePlayersWithDb(
		[livePlayer("M∆GIC ♥", "P1"), livePlayer("Excluded", "P2")],
		[dbPlayer("P1", "Stored Name", "stored name")],
	)

	assert.deepEqual(states.map(({ name }) => name), ["M∆GIC ♥"])
});

test("live row display preserves every character in a nonblank snapshot name", () => {
	const [state] = mergeLivePlayersWithDb(
		[livePlayer("  Exact  Player  ", "P1")],
		[dbPlayer("P1", "Stored Name", "stored name")],
	)

	assert.equal(state?.name, "  Exact  Player  ")
	assert.equal(getPlayerDisplayName(state?.name), "  Exact  Player  ")
})

function livePlayer(
	name: string,
	playfabId: string,
	overrides: Partial<PlayerEntry> = {},
): PlayerEntry {
	return {
		index: 1,
		name,
		playfabId,
		rawLine: `${name} ${playfabId}`,
		...overrides,
	};
}

function dbPlayer(
	playfabId: string,
	latestName: string,
	latestNormalizedName: string | null,
	overrides: Partial<DbPlayerListItem> = {},
): DbPlayerListItem {
	return {
		id: 10,
		playfabId,
		latestName,
		latestNormalizedName,
		lastLogin: null,
		playtimeHours: null,
		activeBanKind: null,
		isOnline: false,
		lastSeen: "2026-07-15T00:00:00.000Z",
		createdAt: "2026-07-15T00:00:00.000Z",
		updatedAt: "2026-07-15T00:00:00.000Z",
		...overrides,
	};
}
