import assert from `node:assert/strict`
import test from `node:test`

import {
	GameServerListQueryError,
	parseGameServerListQuery
} from `./gameServerListQuery`

test(`parses the complete server query without losing false`, () => {
	assert.deepEqual(parseGameServerListQuery({
		page: `2`,
		search: ` Duel `,
		official: false,
		region: ` EU `,
		gameMode: ` FFA `,
		minSlots: `20`,
		maxSlots: `64`,
		minPlayers: `2`,
		maxPlayers: `40`,
		duels: true,
		deleted: `all`,
		sortBy: `players`,
		sortOrder: `asc`,
		includeMainMenu: true,
		yours: true
	}), {
		page: 2,
		search: `Duel`,
		official: false,
		region: `EU`,
		gameMode: `FFA`,
		minSlots: 20,
		maxSlots: 64,
		minPlayers: 2,
		maxPlayers: 40,
		duels: true,
		deleted: `all`,
		sortBy: `players`,
		sortOrder: `asc`,
		includeMainMenu: true,
		yours: true
	})
})

test(`parses unknown provider and applies defaults`, () => {
	assert.deepEqual(parseGameServerListQuery({ official: `unknown` }), {
		page: 1,
		official: null,
		duels: false,
		deleted: `active`,
		sortBy: `default`,
		sortOrder: `desc`,
		includeMainMenu: false,
		yours: false
	})
})

test(`parses every supported provider representation`, () => {
	for (const [value, expected] of [
		[true, true],
		[`true`, true],
		[1, true],
		[`1`, true],
		[false, false],
		[`false`, false],
		[0, false],
		[`0`, false],
		[null, null]
	] as const) {
		assert.equal(parseGameServerListQuery({ official: value }).official, expected)
	}
	assert.equal(parseGameServerListQuery({}).official, undefined)
})

test(`omits blank optional strings`, () => {
	assert.deepEqual(parseGameServerListQuery({ search: ` `, region: ``, gameMode: `  ` }), {
		page: 1,
		duels: false,
		deleted: `active`,
		sortBy: `default`,
		sortOrder: `desc`,
		includeMainMenu: false,
		yours: false
	})
})

test(`rejects invalid pages, slots, and ranges`, () => {
	const invalid = [
		{ page: 0 },
		{ page: Math.floor(Number.MAX_SAFE_INTEGER / 100) + 1 },
		{ minSlots: 0 },
		{ maxSlots: 91 },
		{ minSlots: 65, maxSlots: 64 },
		{ minPlayers: -1 },
		{ maxPlayers: 91 },
		{ minPlayers: 41, maxPlayers: 40 }
	]

	for (const value of invalid) {
		assert.throws(() => parseGameServerListQuery(value), GameServerListQueryError)
	}
})

test(`rejects unsupported query values`, () => {
	const invalid = [
		`server`,
		[],
		{ official: `hosted` },
		{ deleted: `yes` },
		{ sortBy: `lastSeen` },
		{ sortOrder: `newest` },
		{ includeMainMenu: `maybe` },
		{ yours: `maybe` },
		{ duels: `maybe` },
		{ search: `x`.repeat(256) }
	]

	for (const value of invalid) {
		assert.throws(() => parseGameServerListQuery(value), GameServerListQueryError)
	}
})
