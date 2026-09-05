import assert from 'node:assert/strict'
import test from 'node:test'
import { extractDbPlayers } from './dbPlayers.js'

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
