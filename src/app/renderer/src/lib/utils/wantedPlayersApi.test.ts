import assert from 'node:assert/strict'
import test from 'node:test'
import type {
	ChivServerApi,
	CoreCallResult,
	PlayerListQuery,
	WantedPlayerListItem,
} from '$lib/core'

const completeQuery: PlayerListQuery = {
	page: 2,
	include: ['P1', 'P2'],
	search: 'magic',
	isOnline: true,
	active: true,
	minRank: 10,
	maxRank: 100,
	minOffenses: 1,
	minPlaytimeHours: 20,
	maxPlaytimeHours: 500,
	newAccounts: true,
	banned: true,
	sortBy: 'rank',
	sortOrder: 'asc',
	createdAfter: '2026-08-01',
	createdBefore: '2026-08-26',
}

test('forwards the complete player query unchanged and keeps fixed page metadata', async () => {
	const queries: PlayerListQuery[] = []
	setServerApi(async (query = {}) => {
		queries.push(query)
		return result({ players: [wantedPlayer()], meta: pageMeta() })
	})
	const { getWantedPlayers } = await import('./wantedPlayersApi.js')

	const page = await getWantedPlayers(completeQuery)

	assert.deepEqual(queries, [completeQuery])
	assert.equal(page.meta.pageSize, 100)
	assert.equal(page.players[0]?.wanted.originalActionId, 7)
	assert.deepEqual(page.players[0]?.wanted.originServer, {
		id: 7,
		name: `Duel`,
		displayName: null,
	})
	assert.equal(page.players[0]?.wanted.completedServerCount, 3)
	assert.equal(page.players[0]?.banCount, 4)
	assert.equal(page.players[0]?.noteCount, 2)
})

test('preserves null action metadata for manually wanted players', async () => {
	setServerApi(async () => result({
		players: [wantedPlayer({
			scope: null,
			reason: null,
			offenseType: null,
			duration: null,
			author: null,
			wantedAt: '2026-08-26T10:00:00.000Z',
			originalActionId: null,
			actionType: null,
			originServer: null,
			completedServerCount: 0,
			targetServerCount: null,
		})],
		meta: pageMeta(),
	}))
	const { getWantedPlayers } = await import('./wantedPlayersApi.js')

	const manual = (await getWantedPlayers()).players[0]?.wanted

	assert.deepEqual(manual, {
		scope: null,
		reason: null,
		offenseType: null,
		duration: null,
		author: null,
		wantedAt: '2026-08-26T10:00:00.000Z',
		originalActionId: null,
		actionType: null,
		originServer: null,
		completedServerCount: 0,
		targetServerCount: null,
	})
})

test('keeps Wanted metadata attached to its player when malformed rows are filtered', async () => {
	const manualWanted: WantedPlayerListItem['wanted'] = {
		scope: null,
		reason: null,
		offenseType: null,
		duration: null,
		author: null,
		wantedAt: '2026-08-26T11:00:00.000Z',
		originalActionId: null,
		actionType: null,
		originServer: null,
		completedServerCount: 0,
		targetServerCount: null,
	}
	const actionWanted = wantedPlayer().wanted
	setServerApi(async () => result({
		players: [
			{ playfabId: 'BROKEN', wanted: actionWanted },
			{ ...wantedPlayer(manualWanted), id: 2, playfabId: 'P2' },
			{ ...wantedPlayer(actionWanted), id: 3, playfabId: 'P3' },
		],
		meta: { ...pageMeta(), totalResults: 2 },
	}))
	const { getWantedDisplayMeta, getWantedPlayers } = await import('./wantedPlayersApi.js')

	const page = await getWantedPlayers()

	assert.deepEqual(page.players.map(player => [player.id, player.wanted]), [
		[2, manualWanted],
		[3, actionWanted],
	])
	assert.deepEqual(getWantedDisplayMeta(page.players[0]!.wanted), {
		scope: 'Scope unavailable',
		reason: 'Reason unavailable',
		offenseType: 'Offense unavailable',
		duration: 'Unavailable',
		author: 'Author unavailable',
		actionType: `Action unavailable`,
		origin: `Origin unavailable`,
		coverage: `Coverage unavailable`,
	})
})

test('shows unavailable action metadata for manual Wanted rows', async () => {
	const module = await import('./wantedPlayersApi.js')
	const getDisplayMeta = Reflect.get(module, 'getWantedDisplayMeta')
	assert.equal(typeof getDisplayMeta, 'function')

	assert.deepEqual(getDisplayMeta({
		scope: null,
		reason: null,
		offenseType: null,
		duration: null,
		author: null,
		wantedAt: '2026-08-26T10:00:00.000Z',
		originalActionId: null,
		actionType: null,
		originServer: null,
		completedServerCount: 0,
		targetServerCount: null,
	}), {
		scope: 'Scope unavailable',
		reason: 'Reason unavailable',
		offenseType: 'Offense unavailable',
		duration: 'Unavailable',
		author: 'Author unavailable',
		actionType: `Action unavailable`,
		origin: `Origin unavailable`,
		coverage: `Coverage unavailable`,
	})
})

test('labels only action-backed null durations as permanent', async () => {
	const { getWantedDisplayMeta } = await import('./wantedPlayersApi.js')
	const wanted = wantedPlayer().wanted

	assert.equal(getWantedDisplayMeta(wanted).duration, 'Permanent')
	assert.equal(getWantedDisplayMeta({ ...wanted, duration: 24 }).duration, '24 hours')
})

test(`formats open-ended ban and mock coverage separately from finite reverts`, async () => {
	const { getWantedDisplayMeta } = await import(`./wantedPlayersApi.js`)
	const ban = wantedPlayer().wanted

	assert.deepEqual(getWantedDisplayMeta(ban), {
		scope: `Global`,
		reason: `Hacking`,
		offenseType: `Hacker`,
		duration: `Permanent`,
		author: `Admin`,
		actionType: `Ban`,
		origin: `Duel`,
		coverage: `3 servers reached`,
	})
	assert.equal(getWantedDisplayMeta({
		...ban,
		actionType: `mock`,
		originServer: null,
		completedServerCount: 1,
	}).coverage, `1 server reached`)
	assert.equal(getWantedDisplayMeta({
		...ban,
		actionType: `unban`,
		completedServerCount: 2,
		targetServerCount: 5,
	}).coverage, `2/5 reverted`)
})

test(`rejects malformed Wanted action and coverage metadata`, async () => {
	const { parseWantedPlayerPage } = await import(`./wantedPlayersApi.js`)
	for (const wanted of [
		{ ...wantedPlayer().wanted, actionType: `kick` },
		{ ...wantedPlayer().wanted, completedServerCount: -1 },
		{ ...wantedPlayer().wanted, targetServerCount: 2.5 },
	]) {
		assert.throws(
			() => parseWantedPlayerPage({ players: [wantedPlayer(wanted as never)], meta: pageMeta() }),
			/Invalid wanted player data\./,
		)
	}
})

function setServerApi(getWantedPlayers: ChivServerApi['getWantedPlayers']): void {
	Object.defineProperty(globalThis, 'window', {
		configurable: true,
		value: { chivServer: { getWantedPlayers } },
	})
}

function result(data: unknown): CoreCallResult {
	return { ok: true, status: 200, statusText: 'OK', data: { ok: true, data } }
}

function pageMeta() {
	return {
		currentPage: 1,
		pageSize: 100,
		totalPages: 1,
		totalResults: 1,
		hasPrevious: false,
		hasNext: false,
	}
}

function wantedPlayer(wanted: WantedPlayerListItem['wanted'] = {
	scope: 'global',
	reason: 'Hacking',
	offenseType: 'hacker',
	duration: null,
	author: { id: 3, username: 'Admin', playfabId: 'ADMIN' },
	wantedAt: '2026-08-26T10:00:00.000Z',
	originalActionId: 7,
	actionType: `ban`,
	originServer: { id: 7, name: `Duel`, displayName: null },
	completedServerCount: 3,
	targetServerCount: null,
}) {
	return {
		id: 1,
		banCount: 4,
		noteCount: 2,
		playfabId: 'P1',
		latestName: 'Player',
		latestNormalizedName: 'player',
		lastLogin: null,
		playtimeHours: null,
		activeBanKind: 'hacker',
		isOnline: false,
		wanted,
	}
}
