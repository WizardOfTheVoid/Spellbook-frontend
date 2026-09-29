import assert from 'node:assert/strict'
import test from 'node:test'
import type { DbPlayerListItem } from '$lib/core'
import { createDbPlayerState } from './playerStateData.js'
import { PLAYER_FILTER_CHIPS } from './playerFilters.js'
import { activePlayerFilterTags, clearPlayerArchiveFilters, effectivePlayerFilterIds, removeAdvancedPlayerFilter, removePlayerFilterTag, shouldHidePlayerFilterTags, togglePlayerView } from './playerArchiveControls.js'
import * as playerFilters from './playerFilters.js'
import { createRangeScale } from '../components/ui/range/rangeScale.js'
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
	PLAYTIME_INFINITY,
	preparePlayerArchiveLoad,
	pagePreparedRoster,
	resolveFailedRosterPlayers,
	transformPlayerArchive
} from './playerArchive.js'
import { parsePlayerPage } from './playersApi.js'

test(`prepared live pages keep the complete roster available without mutating it`, () => {
	const players = Array.from({ length: 105 }, (_, id) => createDbPlayerState({ id, playfabId: `${id}` } as DbPlayerListItem))
	const roster = { players, state: `ok` as const, error: null, refreshedAt: `2026-09-13T12:00:00Z` }
	const result = pagePreparedRoster(roster, 2)
	assert.deepEqual(result.players.map(player => player.playfabId), [`100`, `101`, `102`, `103`, `104`])
	assert.equal(result.rosterPlayers, players)
	assert.deepEqual(result.meta, { currentPage: 2, totalPages: 2, totalResults: 105, pageSize: 100, hasPrevious: true, hasNext: false })
	assert.equal(pagePreparedRoster({ ...roster, players: [] }, 1).meta.totalResults, 0)
	assert.equal(pagePreparedRoster({ ...roster, state: `error`, error: `offline` }, 1).error, `offline`)
})

test(`no rank suppresses remembered numeric bounds and remains a backend filter`, () => {
  const query = createPlayerQuery({
    page: 1, search: `Ada`, activeChipIds: [`no-rank`, `priors`],
    filters: { ...defaultPlayerFilters, minRank: 10, maxRank: 50 }
  })
  assert.equal(query.noRank, true)
  assert.equal(query.minRank, undefined)
  assert.equal(query.maxRank, undefined)
  assert.equal(query.minOffenses, 1)
  assert.equal(query.search, `Ada`)
  assert.equal(hasBackendPlayerFilters(``, [`no-rank`], defaultPlayerFilters), true)
})

test(`the offenses slider endpoint means at least ten, including restored older values`, () => {
  const query = (minOffenses: number) => createPlayerQuery({
    page: 1, search: ``, activeChipIds: [],
    filters: { ...defaultPlayerFilters, minOffenses },
  })
  assert.equal(query(10).minOffenses, 10)
  assert.equal(query(100).minOffenses, 10)
})

test(`rank chips replace each other without clearing unrelated filters`, () => {
  assert.deepEqual(playerFilters.togglePlayerFilter([`low-rank`, `priors`], `no-rank`), [`priors`, `no-rank`])
  assert.deepEqual(playerFilters.togglePlayerFilter([`no-rank`, `banned`], `low-rank`), [`banned`, `low-rank`])
  assert.deepEqual(playerFilters.togglePlayerFilter([`no-rank`, `banned`], `no-rank`), [`banned`])
})

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
		activeChipIds: ['low-rank', 'priors', 'non-eu'],
		filters: defaultPlayerFilters
	}), {
		page: 1,
		maxRank: 49,
		minOffenses: 1
	})
})

test('maps archive filter controls without sending infinity handles', () => {
	assert.deepEqual(createPlayerQuery({
		page: 1,
		search: ``,
		activeChipIds: [`new-accounts`, `banned`, `online`],
		filters: {
			...defaultPlayerFilters,
			minRank: 100,
			maxRank: 1801,
			minPlaytimeHours: 500,
			maxPlaytimeHours: PLAYTIME_INFINITY,
			sortBy: `rank`,
			sortOrder: `asc`
		}
	}), {
		page: 1,
		newAccounts: true,
		banned: true,
		isOnline: true,
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
	assert.equal(formatPlaytimeHours(PLAYTIME_INFINITY), `INF`)
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
		activeChipIds: [`active`, `priors`, `banned`],
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
		activeChipIds: [`banned`],
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

test(`remembers the selected view independently from advanced filters`, () => {
	const session = createPlayerArchiveSession()
	session.save({ ...session.load(), viewIds: [`online`, `banned`], activeChipIds: [`low-rank`] })
	assert.deepEqual(session.load().viewIds, [`online`, `banned`])
	assert.deepEqual(session.load().activeChipIds, [`low-rank`])
})

test(`multiple view presets combine with filters and All clears views only`, () => {
	assert.deepEqual(togglePlayerView([`online`], `banned`), [`online`, `banned`])
	assert.deepEqual(togglePlayerView([`online`, `banned`], `online`), [`banned`])
	assert.deepEqual(togglePlayerView([`online`, `banned`], `all`), [])
	assert.deepEqual(effectivePlayerFilterIds([`online`, `banned`], [`online`, `low-rank`]), [`online`, `banned`, `low-rank`])
	assert.deepEqual(effectivePlayerFilterIds([], [`low-rank`]), [`low-rank`])
	assert.deepEqual(removePlayerFilterTag({ viewIds: [`online`, `banned`], chipIds: [`online`, `low-rank`] }, `view:online`), { viewIds: [`banned`], chipIds: [`online`, `low-rank`] })
})

test(`clear filters retains sorting, while tag removal resets only its own range`, () => {
	const filters = { ...defaultPlayerFilters, minRank: 20, maxRank: 60, minPlaytimeHours: 100, sortBy: `rank` as const, sortOrder: `asc` as const }
	const cleared = clearPlayerArchiveFilters(filters)
	assert.deepEqual(cleared.viewIds, [])
	assert.deepEqual(cleared.chipIds, [])
	assert.equal(cleared.filters.minRank, defaultPlayerFilters.minRank)
	assert.equal(cleared.filters.sortBy, `rank`)
	assert.equal(cleared.filters.sortOrder, `asc`)
	const withoutRank = removeAdvancedPlayerFilter(filters, `rank`)
	assert.equal(withoutRank.minRank, defaultPlayerFilters.minRank)
	assert.equal(withoutRank.maxRank, defaultPlayerFilters.maxRank)
	assert.equal(withoutRank.minPlaytimeHours, 100)
})

test(`active tags retain view and filter origins and exclude sorting`, () => {
	const tags = activePlayerFilterTags({ ...defaultPlayerFilters, minRank: 10, maxRank: 100, sortBy: `rank` }, [`banned`], [`banned`])
	assert.deepEqual(tags.map(tag => [tag.key, tag.origin, tag.icon]), [
		[`view:banned`, `view`, `fa-users`],
		[`filter:banned`, `filter`, `fa-filter`],
		[`filter:rank`, `filter`, `fa-filter`]
	])
})

test(`archive controls collapse after downward scrolling past 100 pixels`, () => {
	assert.equal(shouldHidePlayerFilterTags({ top: 101, maxTop: 500 }, { top: 100, maxTop: 500 }, false), true)
	assert.equal(shouldHidePlayerFilterTags({ top: 100, maxTop: 500 }, { top: 99, maxTop: 500 }, false), false)
	assert.equal(shouldHidePlayerFilterTags({ top: 230, maxTop: 500 }, { top: 240, maxTop: 500 }, true), false)
})

test(`archive controls ignore scroll changes caused by collapsing at the bottom`, () => {
	assert.equal(shouldHidePlayerFilterTags({ top: 350, maxTop: 350 }, { top: 400, maxTop: 400 }, true), true)
	assert.equal(shouldHidePlayerFilterTags({ top: 80, maxTop: 80 }, { top: 110, maxTop: 110 }, true), true)
	assert.equal(shouldHidePlayerFilterTags({ top: 330, maxTop: 350 }, { top: 350, maxTop: 350 }, true), false)
	assert.equal(shouldHidePlayerFilterTags({ top: 380, maxTop: 400 }, { top: 330, maxTop: 350 }, false), false)
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
		activeChipIds: [],
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

test('uses single-hour playtime range precision', () => {
	const scale = createRangeScale(0, PLAYTIME_INFINITY, PLAYTIME_RANGE_STEP)
	const filters = { ...defaultPlayerFilters, minPlaytimeHours: scale.snap(137), maxPlaytimeHours: scale.snap(9999) }
	const query = createPlayerQuery({ page: 1, search: ``, activeChipIds: [], filters })
	assert.equal(query.minPlaytimeHours, 137)
	assert.equal(query.maxPlaytimeHours, 9999)
	assert.equal(createPlayerQuery({ page: 1, search: ``, activeChipIds: [], filters: { ...filters, maxPlaytimeHours: scale.fromRatio(1) } }).maxPlaytimeHours, undefined)
})

test(`wanted defaults survive resets and identity changes without counting as a filter`, () => {
	const filters = createDefaultPlayerFilters(`wanted`)
	assert.equal(filters.sortBy, `wantedAt`)
	assert.equal(filters.sortOrder, `desc`)
	assert.equal(countAdvancedPlayerFilters(filters, `database`, `wanted`), 0)
	assert.equal(createPlayerArchiveResetState(`wanted`).filters.sortBy, `wantedAt`)
	const session = createPlayerArchiveSession(`wanted`)
	session.bind(`first`)
	session.save({ ...session.load(), filters: { ...filters, sortBy: `rank` } })
	assert.equal(session.bind(`second`).filters.sortBy, `wantedAt`)
	const query = createPlayerQuery({ page: 2, search: ``, activeChipIds: [], filters })
	assert.equal(query.sortBy, `wantedAt`)
	assert.equal(query.page, 2)
})

test('retired Active is unavailable and does not affect player queries', () => {
	assert.equal(PLAYER_FILTER_CHIPS.some(({ id }) => id === `active`), false)
	assert.deepEqual(createPlayerQuery({ page: 1, search: ``, activeChipIds: [`active`], filters: defaultPlayerFilters }), { page: 1 })
})

test('keeps Online in database filters and removes New and Priors from filter choices', () => {
	const getPlayerFilterChips = (playerFilters as typeof playerFilters & {
		getPlayerFilterChips?: (mode: 'database' | 'live') => typeof PLAYER_FILTER_CHIPS
	}).getPlayerFilterChips
	const online = getPlayerFilterChips?.(`database`).find(({ id }) => id === `online`)
	assert.ok(online && !online.disabled)

	assert.deepEqual(getPlayerFilterChips?.('database').map(({ id }) => id), [
		'no-rank',
		'low-rank', 'banned', 'online'
	])
	assert.deepEqual(getPlayerFilterChips?.('live').map(({ id }) => id), [
		'no-rank',
		'low-rank', 'banned', 'non-eu'
	])
	assert.deepEqual(playerFilters.availablePlayerFilterIds([`new-accounts`, `priors`, `banned`]), [`banned`])
	assert.equal(createPlayerQuery({
		page: 1,
		search: ``,
		activeChipIds: playerFilters.togglePlayerFilter([`online`], `online`),
		filters: defaultPlayerFilters
	}).isOnline, undefined)
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

test(`last active dates reach player queries and count as backend filters`, () => {
  const filters = { ...defaultPlayerFilters, lastSeenAfter: `2026-08-29`, lastSeenBefore: `2026-09-27` }
  const query = createPlayerQuery({ page: 1, search: ``, activeChipIds: [], filters })
  assert.equal(query.lastSeenAfter, `2026-08-29`)
  assert.equal(query.lastSeenBefore, `2026-09-27`)
  assert.equal(hasBackendPlayerFilters(``, [], filters), true)
  assert.equal(countAdvancedPlayerFilters(filters, `database`), 2)
})

test('distinguishes backend filters from the live-only ping filter', () => {
	assert.equal(hasBackendPlayerFilters('', ['non-eu'], defaultPlayerFilters), false)
	assert.equal(hasBackendPlayerFilters('MAGIC', ['non-eu'], defaultPlayerFilters), true)
	assert.equal(hasBackendPlayerFilters('', ['priors'], defaultPlayerFilters), true)
	assert.equal(hasBackendPlayerFilters('', ['active'], defaultPlayerFilters), false)
	assert.equal(hasBackendPlayerFilters(``, [`online`], defaultPlayerFilters), true)
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

test(`live archive sorts by the selected rank and direction`, () => {
	const states = [createDbPlayerState(dbPlayer(1, `First`)), createDbPlayerState(dbPlayer(2, `Second`))]
	states[0] = { ...states[0]!, rank: 10 }
	states[1] = { ...states[1]!, rank: 80 }
	assert.deepEqual(transformPlayerArchive(states, `live`, [], { ...defaultPlayerFilters, sortBy: `rank`, sortOrder: `asc` }).map(player => player.name), [`First`, `Second`])
	assert.deepEqual(transformPlayerArchive(states, `live`, [], { ...defaultPlayerFilters, sortBy: `rank`, sortOrder: `desc` }).map(player => player.name), [`Second`, `First`])
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
