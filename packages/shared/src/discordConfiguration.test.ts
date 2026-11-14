import assert from 'node:assert/strict'
import test from 'node:test'
import { readDiscordConfigurationPatch, discordConfigurationChanges } from './discordConfiguration'

const guildId = `123456789012345678`
const saved = { liveServer: null, guildId, connectionId: 17, guildName: `Guild`, revision: 2, roleId: null, updatesChannelId: `223456789012345678`, helpChannelId: null, statisticsChannelId: null }

test(`live server configuration is an atomic pair and ordinary edits preserve it`, () => {
  const liveServer = { channelId: `323456789012345678`, gameServerId: 42 }
  const metadata = { guildId, connectionId: 17, revision: 2 }
  assert.deepEqual(readDiscordConfigurationPatch({ ...metadata, liveServer }), { ...metadata, liveServer })
  for (const value of [{ channelId: liveServer.channelId }, { gameServerId: 42 }, { ...liveServer, gameServerId: `42` }, { ...liveServer, channelId: `bad` }]) {
    assert.throws(() => readDiscordConfigurationPatch({ ...metadata, liveServer: value }), RangeError)
  }
  const current = { ...saved, liveServer }
  assert.deepEqual(discordConfigurationChanges(current, { ...current, liveServer: { ...liveServer } }), metadata)
  assert.deepEqual(discordConfigurationChanges(current, { ...current, roleId: `423456789012345678` }), { ...metadata, roleId: `423456789012345678` })
  assert.deepEqual(discordConfigurationChanges(current, { ...current, liveServer: null }), { ...metadata, liveServer: null })
})

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
