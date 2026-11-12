import assert from 'node:assert/strict'
import test from 'node:test'
import { rosterFixture } from './serverStoreFixtures'
import { serverStorePlayers } from './serverStorePlayers'

test(`matched A2S players use the latest SpellBook name without changing the observed roster`, () => {
  const data = rosterFixture()
  data.roster.source = `a2s`
  data.roster.players[0] = { ...data.roster.players[0], name: `**乂Bla`, identity: `inferred`, playfabId: null }
  data.players = [{ id: 1, playfabId: `ABC`, latestName: `**乂Blank`, rank: 7 } as never]
  const [player] = serverStorePlayers(data)
  assert.equal(player.name, `**乂Blank`)
  assert.equal(player.dbId, 1)
  assert.equal(player.playfabId, `ABC`)
  assert.equal(player.durationSeconds, 12)
  assert.equal(player.rank, 7)
  assert.equal(data.roster.players[0].name, `**乂Bla`)
})

test(`missing names, missing records and unmatched observations retain the received name`, () => {
  const data = rosterFixture()
  data.roster.source = `a2s`
  data.roster.players[0] = { ...data.roster.players[0], name: `**乂Bla`, identity: `inferred`, playfabId: null }
  for (const latestName of [null, ``, `   `]) {
    data.players = [{ id: 1, playfabId: `ABC`, latestName } as never]
    assert.equal(serverStorePlayers(data)[0].name, `**乂Bla`)
  }
  data.players = []
  assert.equal(serverStorePlayers(data)[0].name, `**乂Bla`)
  data.players = [{ id: 1, playfabId: `ABC`, latestName: `**乂Blank` } as never]
  data.roster.players[0] = { ...data.roster.players[0], playerId: null, identity: `unknown` }
  const [unknown] = serverStorePlayers(data)
  assert.equal(unknown.name, `**乂Bla`)
  assert.equal(unknown.dbId, null)
})

test(`ListPlayers keeps its authoritative live name`, () => {
  const data = rosterFixture()
  data.players = [{ id: 1, playfabId: `ABC`, latestName: `Stored name` } as never]
  assert.equal(serverStorePlayers(data)[0].name, `Canonical`)
})
