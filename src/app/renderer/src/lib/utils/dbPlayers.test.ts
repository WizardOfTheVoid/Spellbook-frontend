import assert from 'node:assert/strict'
import test from 'node:test'
import { extractDbPlayers } from './dbPlayers.js'
import { createDbPlayerState } from './playerStateData.js'

test(`preserves wanted status into player rows and clears it on refresh`, () => {
	for (const isWanted of [true, false, undefined]) {
		const [player] = extractDbPlayers([{ id: 1, playfabId: `P1`, isWanted }])
		assert.equal(createDbPlayerState(player!).dbPlayer?.isWanted, isWanted ?? false)
	}
})

test(`preserves the matched alias through API normalization into row data`, () => {
	for (const matchedAlias of [`BoopBonkSwosh`, null, undefined]) {
		const [player] = extractDbPlayers([{ id: 1, playfabId: `P1`, latestName: `MAGIC`, matchedAlias }])
		const row = createDbPlayerState(player!)
		assert.equal(row.name, `MAGIC`)
		assert.equal(row.dbPlayer?.matchedAlias, matchedAlias ?? null)
	}
})

test('retains cached rank from database player payloads', () => {
	const players = extractDbPlayers([{
		id: 300,
		playfabId: 'P300',
		rank: 55,
		isOnline: false
	}])

	assert.equal(players[0].rank, 55)
})

test('retains original decorated names without synthesizing an offense count', () => {
	const players = extractDbPlayers({ players: [{
		id: 300,
		playfabId: 'P300',
		latestName: 'M∆GIC ♥',
		isOnline: false
	}] })

	assert.equal(players[0]?.latestName, 'M∆GIC ♥')
	assert.equal(Object.hasOwn(players[0] ?? {}, `offenseCount`), false)
})

test('retains cached status fields from database player payloads', () => {
	const players = extractDbPlayers([{
		id: 300,
		playfabId: 'P300',
		lastLogin: '2026-07-30T12:34:56.789Z',
		playtimeHours: 123.5,
		activeBanKind: 'hacker',
		isOnline: false
	}])

	assert.equal(players[0]?.lastLogin, '2026-07-30T12:34:56.789Z')
	assert.equal(players[0]?.playtimeHours, 123.5)
	assert.equal(players[0]?.activeBanKind, 'hacker')
})
