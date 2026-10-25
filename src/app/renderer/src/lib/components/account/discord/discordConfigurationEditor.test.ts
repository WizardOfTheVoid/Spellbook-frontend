import assert from 'node:assert/strict'
import test from 'node:test'
import { EventEmitter, once } from 'node:events'
import { DiscordConfigurationEditor } from './discordConfigurationEditor'

const saved = { guildId: `123456789012345678`, connectionId: 17, guildName: `Guild`, revision: 2, roleId: null,
  updatesChannelId: `223456789012345678`, helpChannelId: null, statisticsChannelId: null }
const resources = { roles: [], channels: [] }

test(`saving sends only changes and keeps the draft when a revision conflict occurs`, async () => {
  const sent: unknown[] = []
  let conflict = true
  const editor = new DiscordConfigurationEditor({ configuration: async () => saved, resources: async () => resources,
    save: async patch => { sent.push(patch); if (conflict) throw new Error(`Reload before saving`); return { ...saved, ...patch, revision: 3 } } })
  await editor.load()
  editor.edit(`updatesChannelId`, null)
  assert.equal(editor.dirty, true)
  assert.equal(await editor.save(), false)
  assert.equal(editor.draft?.updatesChannelId, null)
  assert.equal(editor.saved?.updatesChannelId, saved.updatesChannelId)
  assert.equal(editor.dirty, true)
  conflict = false
  assert.equal(await editor.save(), true)
  assert.equal(editor.dirty, false)
  assert.deepEqual(sent[0], { guildId: saved.guildId, connectionId: 17, revision: 2, updatesChannelId: null })
})

test(`late loads after unlink or disposal cannot restore obsolete settings`, async () => {
  const pending = new EventEmitter()
  const editor = new DiscordConfigurationEditor({ configuration: async () => { await once(pending, `ready`); return saved },
    resources: async () => resources, save: async () => saved })
  const load = editor.load()
  editor.reset()
  pending.emit(`ready`)
  await load
  assert.equal(editor.saved, null)
  const second = editor.load()
  editor.dispose()
  pending.emit(`ready`)
  await second
  assert.equal(editor.saved, null)
})
