import assert from 'node:assert/strict'
import test from 'node:test'
import { addWantedPlayers } from './wantedBulkAdd'

test(`adds trimmed comma and semicolon separated IDs once each`, async () => {
	const created: { playfabId: string, mock: boolean }[] = []
	const result = await addWantedPlayers(`  P1 , P2 ;  P3 ; ; P1  `, true, async input => {
		created.push(input)
	})

	assert.deepEqual(created, [
		{ playfabId: `P1`, mock: true },
		{ playfabId: `P2`, mock: true },
		{ playfabId: `P3`, mock: true },
	])
	assert.deepEqual(result, { added: 3, failed: [] })
})

test(`continues after a failed ID and returns only failed IDs for retry`, async () => {
	const created: string[] = []
	const result = await addWantedPlayers(`P1; P2, P3`, false, async ({ playfabId }) => {
		created.push(playfabId)
		if (playfabId === `P2`) throw new Error(`Already wanted`)
	})

	assert.deepEqual(created, [`P1`, `P2`, `P3`])
	assert.deepEqual(result, {
		added: 2,
		failed: [{ playfabId: `P2`, error: `Already wanted` }],
	})
})
