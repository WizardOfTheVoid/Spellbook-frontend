import assert from 'node:assert/strict'
import test from 'node:test'
import type { WantedPlayerListItem } from '$lib/core'
import { canRunWantedRowMutation, createWantedRowMenuContext } from './wantedPlayerRow'

test(`maps only persisted Wanted identity and the authenticated viewer into the row menu`, () => {
	const onRevert = async () => {}
	const onRemove = async () => {}
	const context = createWantedRowMenuContext(
		wanted(),
		{ id: 7, isSuperadmin: false },
		{ onRevert, onRemove },
	)

	assert.deepEqual(context, {
		actionType: `ban`,
		sourceActionId: 41,
		sourceAuthorId: 7,
		viewerId: 7,
		isSuperadmin: false,
		onRevert,
		onRemove,
	})
})

test(`allows source-free removal while requiring a source action for revert`, () => {
	assert.equal(canRunWantedRowMutation(`remove`, 11, null), true)
	assert.equal(canRunWantedRowMutation(`revert`, 11, null), false)
	assert.equal(canRunWantedRowMutation(`remove`, null, 41), false)
})

function wanted(): WantedPlayerListItem[`wanted`] {
	return {
		scope: `global`,
		reason: `Cheating`,
		offenseType: `hacker`,
		duration: null,
		author: { id: 7, username: `Admin`, playfabId: null },
		wantedAt: `2026-08-31T00:00:00.000Z`,
		originalActionId: 41,
		actionType: `ban`,
		originServer: { id: 13, name: `Server`, displayName: `Origin` },
		completedServerCount: 2,
		targetServerCount: null,
	}
}
