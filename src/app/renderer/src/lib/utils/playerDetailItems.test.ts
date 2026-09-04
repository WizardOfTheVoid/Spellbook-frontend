import assert from 'node:assert/strict'
import test from 'node:test'
import type { PlayerAction } from '$lib/core'
import { buildMetaItems } from './playerDetailItems'

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
