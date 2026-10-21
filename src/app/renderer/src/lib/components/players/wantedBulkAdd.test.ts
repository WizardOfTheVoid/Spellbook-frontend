import assert from 'node:assert/strict'
import test from 'node:test'
import { addWantedPlayers } from './wantedBulkAdd'

test(`adds trimmed comma and semicolon separated IDs once each`, async () => {
	const created: { playfabId: string, mock: boolean, source: string }[] = []
	const result = await addWantedPlayers(`  P1 , P2 ;  P3 ; ; P1  `, true, `SpellBook`, async input => {
		created.push(input)
	})

	assert.deepEqual(created, [
		{ playfabId: `P1`, mock: true, source: `SpellBook` },
		{ playfabId: `P2`, mock: true, source: `SpellBook` },
		{ playfabId: `P3`, mock: true, source: `SpellBook` },
	])
	assert.deepEqual(result, { added: 3, failed: [] })
})

test(`continues after a failed ID and returns only failed IDs for retry`, async () => {
	const created: string[] = []
	const result = await addWantedPlayers(`P1; P2, P3`, false, `SpellBook`, async ({ playfabId }) => {
		created.push(playfabId)
		if (playfabId === `P2`) throw new Error(`Already wanted`)
	})

	assert.deepEqual(created, [`P1`, `P2`, `P3`])
	assert.deepEqual(result, {
		added: 2,
		failed: [{ playfabId: `P2`, error: `Already wanted` }],
	})
})

test(`uses the same manual source for each submitted player`, async () => {
	const created: unknown[] = []
	await addWantedPlayers(`P1; P2`, false, `  Community report  `, async input => {
		created.push(input)
	})
	assert.deepEqual(created, [
		{ playfabId: `P1`, mock: false, source: `Community report` },
		{ playfabId: `P2`, mock: false, source: `Community report` },
	])
})
