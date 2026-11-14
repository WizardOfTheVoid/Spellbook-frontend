import assert from 'node:assert/strict'
import test from 'node:test'
import type { PlayerAction } from '$lib/core'
import { buildMetaItems, buildNicknameItems } from './playerDetailItems'
import { formatFullDateTime } from './playerUtils'

test(`nickname tiles show days since that name was seen with a full-date tooltip`, () => {
	const now = new Date(`2026-09-07T12:00:00.000Z`)
	const names = [
		{ name: `Current`, lastSeen: `2026-09-07T10:00:00.000Z` },
		{ name: `Yesterday`, lastSeen: `2026-09-06T12:00:00.000Z` },
		{ name: `Older`, lastSeen: `2026-09-02T12:00:00.000Z` },
	]
	const items = buildNicknameItems(names, 4, now)
	assert.deepEqual(items.map(item => item.subtitle), [`0 days since`, `1 day since`, `5 days since`])
	assert.deepEqual(items.map(item => item.title), names.map(name => name.name))
	assert.deepEqual(items.map(item => item.tooltip), names.map(name => formatFullDateTime(name.lastSeen)))
	assert.equal(buildNicknameItems(names, 2, now).length, 2)
})

test(`nickname tiles handle missing dates and avoid negative elapsed days`, () => {
	const items = buildNicknameItems([
		{ name: `Unknown`, lastSeen: `` },
		{ name: `Future`, lastSeen: `2026-09-08T12:00:00.000Z` },
	], 4, new Date(`2026-09-07T12:00:00.000Z`))
	assert.equal(items[0]?.subtitle, `Last seen unknown`)
	assert.equal(items[0]?.tooltip, null)
	assert.equal(items[1]?.subtitle, `0 days since`)
})

test('shows only PlayFab-backed player values as loading during refresh', () => {
	const items = buildMetaItems(null, [], [], [], true)
	const subtitles = Object.fromEntries(items.map(item => [item.title, item.subtitle]))

	assert.equal(subtitles['Total bans'], '0 times')
	assert.equal(subtitles['Nicknames'], '0 names in history')
	assert.equal(subtitles['Account created'], 'Loading...')
	assert.equal(subtitles.Rank, 'Loading...')
	assert.equal(subtitles['Last login'], 'Loading...')
	assert.equal(subtitles.Playtime, 'Loading...')
})

test(`excludes unban history from Total offenses`, () => {
	const ban = action({ id: 1, actionType: `ban`, offenseType: `hacker` })
	const unban = action({ id: 2, actionType: `unban`, offenseType: null, relatedActionId: ban.id })
	const items = buildMetaItems(null, [ban, unban], [ban], [])
	const subtitles = Object.fromEntries(items.map(item => [item.title, item.subtitle]))

	assert.equal(subtitles[`Total offenses`], `1 time`)
})

function action(overrides: Partial<PlayerAction>): PlayerAction {
	return {
		id: 1,
		playerId: 42,
		gameServerId: 7,
		authorId: 3,
		actionType: `ban`,
		offenseType: `hacker`,
		duration: null,
		reason: null,
		scope: `global`,
		relatedActionId: null,
		autoban: false,
		originalActionId: null,
		expiresAt: null,
		createdAt: `2026-08-26T10:00:00.000Z`,
		updatedAt: `2026-08-26T10:00:00.000Z`,
		author: { id: 3, username: `Admin`, playfabId: null },
		gameServer: { id: 7, name: `Duel`, displayName: null },
		...overrides,
	}
}
