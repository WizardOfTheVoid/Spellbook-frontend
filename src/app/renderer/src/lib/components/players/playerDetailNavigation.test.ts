import assert from 'node:assert/strict'
import test from 'node:test'
import * as navigation from './playerDetailNavigation'

const { playerDetailBackTarget } = navigation

test(`keeps profile subpages and referenced details in their owning navigation level`, () => {
	assert.equal(playerDetailBackTarget(true, false, false, false), `profile`)
	assert.equal(playerDetailBackTarget(false, true, false, false), `profile`)
	assert.equal(playerDetailBackTarget(false, false, true, false), `profile`)
	assert.equal(playerDetailBackTarget(false, false, false, true), `profile`)
	assert.equal(playerDetailBackTarget(false, true, false, true), `notes`)
	assert.equal(playerDetailBackTarget(false, false, true, true), `notes`)
	assert.equal(playerDetailBackTarget(false, false, false, false), `parent`)
})

test(`targets the existing player Notes subpage`, () => {
	const targetPlayerNotes = (navigation as unknown as {
		playerNotesNavigationTarget?: <T>(player: T) => unknown
	}).playerNotesNavigationTarget
	assert.equal(typeof targetPlayerNotes, `function`)

	const player = { playfabId: `PLAYER_1` }
	assert.deepEqual(targetPlayerNotes?.(player), {
		page: `players`,
		player,
		subpage: `notes`,
	})
})
