import assert from 'node:assert/strict'
import test from 'node:test'
import { readDiscordConfigurationPatch, discordConfigurationChanges } from './discordConfiguration'

const guildId = `123456789012345678`
const saved = { guildId, connectionId: 17, guildName: `Guild`, revision: 2, roleId: null, updatesChannelId: `223456789012345678`, helpChannelId: null, statisticsChannelId: null }

test(`configuration changes send only edited fields and preserve explicit clearing`, () => {
  assert.deepEqual(discordConfigurationChanges(saved, { ...saved, updatesChannelId: null }), { guildId, connectionId: 17, revision: 2, updatesChannelId: null })
  assert.deepEqual(discordConfigurationChanges(saved, saved), { guildId, connectionId: 17, revision: 2 })
})

test(`configuration patches validate IDs and revisions while accepting a role-only save`, () => {
  const patch = { guildId, connectionId: 17, revision: 2, roleId: `323456789012345678` }
  assert.deepEqual(readDiscordConfigurationPatch(patch), patch)
  for (const value of [{ ...patch, roleId: 42 }, { ...patch, revision: -1 }, { ...patch, guildId: `wrong` }, { ...patch, helpChannelId: `wrong` }]) {
    assert.throws(() => readDiscordConfigurationPatch(value), RangeError)
  }
})
