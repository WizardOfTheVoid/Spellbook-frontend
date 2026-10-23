import assert from 'node:assert/strict'
import test from 'node:test'
import { parseServerHistoryPeriod, serverHistoryPeriods } from './gameServerOverview'
import { emptyTeamSettings, resolveTeamDefaults } from './teamSettings'

test(`server history accepts only bounded periods`, () => {
  assert.equal(parseServerHistoryPeriod(undefined), `day`)
  for (const period of Object.keys(serverHistoryPeriods)) assert.equal(parseServerHistoryPeriod(period), period)
  for (const value of [`all`, ``, null, [], 30, {}]) assert.throws(() => parseServerHistoryPeriod(value))
})

test(`claimed and unclaimed server defaults never revive legacy clan overrides`, () => {
  const server = { clanName: `Legacy name`, clanTag: `OLD` }
  const team = { ...emptyTeamSettings(`Team`), tag: `NEW` }
  assert.deepEqual(resolveTeamDefaults(server, team).server, { clanName: `Team`, clanTag: `NEW` })
  assert.deepEqual(resolveTeamDefaults(server, null).server, { clanName: null, clanTag: null })
  assert.deepEqual(resolveTeamDefaults(server, { ...team, tag: `` }).server, { clanName: `Team`, clanTag: null })
  assert.equal(server.clanTag, `OLD`)
})
