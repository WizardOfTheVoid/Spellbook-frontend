import assert from 'node:assert/strict'
import test from 'node:test'
import type { DbPlayerListItem } from '$lib/core'
import { createDbPlayerState } from './playerStateData.js'
import { PLAYER_FILTER_CHIPS } from './playerFilters.js'
import * as playerFilters from './playerFilters.js'
import {
	countAdvancedPlayerFilters,
	createDefaultPlayerFilters,
	createPlayerArchiveSession,
	createPlayerArchiveSessionState,
	createPlayerArchiveResetState,
	createPlayerQuery,
	defaultPlayerFilters,
	formatPlaytimeHours,
	formatRank,
	hasBackendPlayerFilters,
	hidePlayersWhileLoading,
	PLAYTIME_RANGE_STEP,
	preparePlayerArchiveLoad,
	resolveFailedRosterPlayers,
	transformPlayerArchive
} from './playerArchive.js'
import { parsePlayerPage } from './playersApi.js'

test(`creates independent default filter state`, () => {
	const first = createDefaultPlayerFilters()
	first.minOffenses = 4
	assert.deepEqual(createDefaultPlayerFilters(), defaultPlayerFilters)
})

test(`creates a complete independent archive reset`, () => {
	const reset = createPlayerArchiveResetState()
	reset.filters.minRank = 50
	assert.deepEqual(reset, {
		page: 1,
		searchInput: ``,
		search: ``,
		filters: { ...defaultPlayerFilters, minRank: 50 },
		queryFilters: defaultPlayerFilters,
		activeChipIds: []
	})
})

test(`counts changed advanced controls by visible control`, () => {
	assert.equal(countAdvancedPlayerFilters({
		...createDefaultPlayerFilters(),
		offendersOnly: true,
		createdAfter: `2026-08-01`,
		minRank: 50,
		maxRank: 500,
		minPlaytimeHours: 100,
		sortBy: `rank`,
		sortOrder: `asc`
	}, `database`), 6)
})

test(`does not count database-only sorting in live mode`, () => {
	assert.equal(countAdvancedPlayerFilters({
		...createDefaultPlayerFilters(),
		sortBy: `rank`,
		sortOrder: `asc`
	}, `live`), 0)
})

test('parses fixed 100-row pages without changing original names', () => {
	const players = Array.from({ length: 100 }, (_, index) => dbPlayer(index + 1, index === 0 ? 'M∆GIC ♥' : `Player ${index}`))
	const page = parsePlayerPage({
		players,
		meta: {
			currentPage: 2,
			pageSize: 100,
			totalPages: 10,
			totalResults: 1000,
			hasPrevious: true,
			hasNext: true
		}
	})

	assert.equal(page.players.length, 100)
	assert.equal(page.players[0]?.latestName, 'M∆GIC ♥')
	assert.equal(page.meta.currentPage, 2)
	assert.equal(page.meta.pageSize, 100)
})

test('rejects malformed player page metadata', () => {
	assert.throws(() => parsePlayerPage({ players: [], meta: { pageSize: 50 } }), /metadata/u)
})

test('maps shared chips to backend query fields', () => {
	assert.deepEqual(createPlayerQuery({
		page: 1,
		search: '',
		activeChipIds: ['low-rank', 'active', 'priors', 'non-eu'],
		filters: defaultPlayerFilters
	}), {
		page: 1,
		active: true,
		maxRank: 100,
		minOffenses: 1
	})
})

test('maps archive filter controls without sending infinity handles or online', () => {
	assert.deepEqual(createPlayerQuery({
		page: 1,
		search: ``,
		activeChipIds: [`new-accounts`, `banned`, `online`],
		filters: {
			...defaultPlayerFilters,
			minRank: 100,
			maxRank: 1801,
			minPlaytimeHours: 500,
			maxPlaytimeHours: 10100,
			sortBy: `rank`,
			sortOrder: `asc`
		}
	}), {
		page: 1,
		newAccounts: true,
		banned: true,
		minRank: 100,
		minPlaytimeHours: 500,
		sortBy: `rank`,
		sortOrder: `asc`
	})
})

test('formats archive range infinity handles and hides rows while loading', () => {
	const players = [createDbPlayerState(dbPlayer(1, `MAGIC`))]

	assert.equal(formatRank(1800), `1800`)
	assert.equal(formatRank(1801), `INF`)
	assert.equal(formatPlaytimeHours(10000), `10000 hours`)
	assert.equal(formatPlaytimeHours(10100), `INF`)
	assert.deepEqual(hidePlayersWhileLoading(players, `loading`), [])
	assert.equal(hidePlayersWhileLoading(players, `ok`), players)
})

test(`restores the applied database archive navigation state`, () => {
	const session = createPlayerArchiveSession()

	session.save({
		page: 3,
		search: `Magic`,
		filters: {
			...defaultPlayerFilters,
			minRank: 50,
			sortBy: `rank`,
			sortOrder: `asc`
		},
		activeChipIds: [`active`, `priors`],
		advancedFiltersOpen: true
	})

	assert.deepEqual(session.load(), {
		page: 3,
		search: `Magic`,
		filters: {
			...defaultPlayerFilters,
			minRank: 50,
			sortBy: `rank`,
			sortOrder: `asc`
		},
		activeChipIds: [`active`, `priors`],
		advancedFiltersOpen: true
	})
})

test(`starts archive navigation sessions from the default query`, () => {
	assert.deepEqual(createPlayerArchiveSession().load(), {
		page: 1,
		search: ``,
		filters: defaultPlayerFilters,
		activeChipIds: [],
		advancedFiltersOpen: false
	})
})

test(`resets an archive session when the authenticated identity is replaced`, () => {
	const session = createPlayerArchiveSession()
	session.bind({ id: 1 })
	session.save({
		page: 4,
		search: `Previous admin query`,
		filters: { ...defaultPlayerFilters, minRank: 50 },
		activeChipIds: [`priors`],
		advancedFiltersOpen: true
	})

	assert.deepEqual(session.bind({ id: 2 }), createPlayerArchiveSession().load())
	assert.deepEqual(session.load(), createPlayerArchiveSession().load())
})

test(`captures current archive input immediately while the backend query is debounced`, () => {
	assert.deepEqual(createPlayerArchiveSessionState({
		page: 3,
		searchInput: `Current unsent query`,
		filters: { ...defaultPlayerFilters, minRank: 80 },
		activeChipIds: [`active`],
		advancedFiltersOpen: true
	}), {
		page: 3,
		search: `Current unsent query`,
		filters: { ...defaultPlayerFilters, minRank: 80 },
		activeChipIds: [`active`],
		advancedFiltersOpen: true
	})
})

test(`retains rendered rows without entering loading during a silent roster refresh`, () => {
	const players = [createDbPlayerState(dbPlayer(1, `MAGIC`))]
	assert.deepEqual(preparePlayerArchiveLoad(`ok`, players, true), {
		state: `ok`,
		players,
	})
	assert.deepEqual(preparePlayerArchiveLoad(`ok`, players, false), {
		state: `loading`,
		players: [],
	})
})

test(`retains the last enriched roster when a silent refresh fails`, () => {
	const roster = [createDbPlayerState(dbPlayer(1, `MAGIC`))]
	assert.equal(resolveFailedRosterPlayers(roster, true, true), roster)
	assert.deepEqual(resolveFailedRosterPlayers(roster, true, false), [])
	assert.equal(resolveFailedRosterPlayers(null, false, true), null)
})

test('uses 100-hour playtime range steps', () => {
	assert.equal(PLAYTIME_RANGE_STEP, 100)
})

test('places Active directly after Low rank', () => {
	const lowRankIndex = PLAYER_FILTER_CHIPS.findIndex(({ id }) => id === 'low-rank')
	assert.deepEqual(PLAYER_FILTER_CHIPS.slice(lowRankIndex, lowRankIndex + 2).map(({ id, label }) => ({ id, label })), [
		{ id: 'low-rank', label: 'Low rank' },
		{ id: 'active', label: 'Active' }
	])
})

test('provides guidance for each available player filter chip', () => {
	assert.deepEqual(PLAYER_FILTER_CHIPS.map(({ id, tooltip }) => ({ id, tooltip })), [
		{ id: `low-rank`, tooltip: `Players ranked 100 or lower.` },
		{ id: `active`, tooltip: `Players seen within the last two weeks.` },
		{ id: `new-accounts`, tooltip: `Accounts created within the last seven days.` },
		{ id: `banned`, tooltip: `Players with a ban active right now.` },
		{ id: `online`, tooltip: `Online filtering is WIP.` },
		{ id: `non-eu`, tooltip: `Live players with 120 ms ping or higher.` },
		{ id: `priors`, tooltip: `Players with at least one recorded offense.` }
	])
})

test('keeps Online in database filters and removes it from the live server list', () => {
	const getPlayerFilterChips = (playerFilters as typeof playerFilters & {
		getPlayerFilterChips?: (mode: 'database' | 'live') => typeof PLAYER_FILTER_CHIPS
	}).getPlayerFilterChips

	assert.deepEqual(getPlayerFilterChips?.('database').map(({ id }) => id), [
		'low-rank', 'active', 'new-accounts', 'banned', 'online', 'priors'
	])
	assert.deepEqual(getPlayerFilterChips?.('live').map(({ id }) => id), [
		'low-rank', 'active', 'new-accounts', 'banned', 'non-eu', 'priors'
	])
})

test('omits incomplete or invalid account dates from player requests', () => {
	const filters = {
		...defaultPlayerFilters,
		createdAfter: '2026-08-2',
		createdBefore: '2026-02-30'
	}
	assert.deepEqual(createPlayerQuery({
		page: 1,
		search: '',
		activeChipIds: [],
		filters
	}), { page: 1 })
	assert.equal(hasBackendPlayerFilters('', [], filters), false)
})

test('distinguishes backend filters from the live-only ping filter', () => {
	assert.equal(hasBackendPlayerFilters('', ['non-eu'], defaultPlayerFilters), false)
	assert.equal(hasBackendPlayerFilters('MAGIC', ['non-eu'], defaultPlayerFilters), true)
	assert.equal(hasBackendPlayerFilters('', ['priors'], defaultPlayerFilters), true)
	assert.equal(hasBackendPlayerFilters('', ['active'], defaultPlayerFilters), true)
})

test('filters live ping locally and sorts kills descending with stable ties', () => {
	const states = [
		createDbPlayerState(dbPlayer(1, 'First')),
		createDbPlayerState(dbPlayer(2, 'Second')),
		createDbPlayerState(dbPlayer(3, 'Third')),
		createDbPlayerState(dbPlayer(4, 'Fourth'))
	]
	states[0] = { ...states[0]!, kills: 5, pingMs: 140 }
	states[1] = { ...states[1]!, kills: null, pingMs: 150 }
	states[2] = { ...states[2]!, kills: 5, pingMs: 130 }
	states[3] = { ...states[3]!, kills: 20, pingMs: 50 }

	assert.deepEqual(
		transformPlayerArchive(states, 'live', ['non-eu']).map(({ name }) => name),
		['First', 'Third', 'Second']
	)
})

test('retains backend order for database archive rows', () => {
	const states = [createDbPlayerState(dbPlayer(2, 'Second')), createDbPlayerState(dbPlayer(1, 'First'))]
	assert.deepEqual(
		transformPlayerArchive(states, 'database', ['non-eu']).map(({ name }) => name),
		['Second', 'First']
	)
})

function dbPlayer(id: number, latestName: string): DbPlayerListItem {
	return {
		id,
		playfabId: `P${id}`,
		latestName,
		latestNormalizedName: latestName.toLowerCase(),
		lastLogin: null,
		playtimeHours: null,
		activeBanKind: null,
		isOnline: false
	}
}
