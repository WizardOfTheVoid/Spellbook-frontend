import assert from 'node:assert/strict'
import test from 'node:test'
import type { ActiveServerProfile, ServerProfileGraph } from '$lib/core'
import { activeProfileGraphs } from './activeProfiles'
import { createProfileActionMenuItems } from './profileActionMenu'

const graph = (id: number, type: `user` | `team`, commandType: `ban` | `unban`): ServerProfileGraph => ({
  profile: { id, owner: { type, id: 7 }, name: `${type} rules`, description: null, isDefault: false },
  servers: [], availableVariables: [],
  actions: [{ id, label: `Same label`, actionDomain: `player`, isEnabled: true, sortOrder: 0, delayMs: 0, iconKey: `ban`, blockOnMissingVariables: false,
    commands: [{ commandType, message: `Configured`, delayMs: 0, sortOrder: 0 }] }],
})

test(`active personal and team actions stay distinct and only personal entries get a faded user marker`, async () => {
  const personal = graph(1, `user`, `ban`)
  const team = graph(2, `team`, `unban`)
  const active: ActiveServerProfile = { source: `assigned`, profile: personal, profiles: [personal, team], gameServer: null, variables: [] }
  const runs: unknown[] = []
  const menu = createProfileActionMenuItems(active, async action => { runs.push(action) })
  assert.deepEqual(activeProfileGraphs(active), [personal, team])
  assert.deepEqual(menu.map(item => [item.name, item.suffixIcon]), [[`Same label`, `fa-user`], [`Same label`, undefined]])
  for (const item of menu) if (typeof item.action === `function`) await item.action()
  assert.deepEqual(runs, [personal.actions[0], team.actions[0]])
  assert.equal(createProfileActionMenuItems(active, async () => {}, { commandType: `unban` }).length, 1)
  assert.equal(createProfileActionMenuItems(active, async () => {}, { excludeUnban: true }).length, 1)
  personal.actions[0].isEnabled = false
  assert.equal(createProfileActionMenuItems(active, async () => {}, { excludeUnban: true }).length, 0)
})

test(`an older server response still resolves its single profile`, () => {
  const personal = graph(1, `user`, `ban`)
  assert.deepEqual(activeProfileGraphs({ source: `assigned`, profile: personal, gameServer: null, variables: [] }), [personal])
  assert.deepEqual(activeProfileGraphs(null), [])
})

test(`groups in-game actions by moderation type and preserves configured execution`, async () => {
  const personal = graph(1, `user`, `ban`)
  personal.actions[0].commands.push({ commandType: `server_message`, message: `Announcement`, delayMs: 0, sortOrder: 1 })
  const team = graph(2, `team`, `unban`)
  team.actions.push({ ...team.actions[0], id: 3, commands: [{ commandType: `kick`, message: `Reason`, delayMs: 0, sortOrder: 0 }] })
  const active: ActiveServerProfile = { source: `assigned`, profile: personal, profiles: [personal, team], gameServer: null, variables: [] }
  const runs: unknown[] = []
  const menu = createProfileActionMenuItems(active, async action => { runs.push(action) }, { groupByType: true })
  assert.deepEqual(menu.map(item => item.name), [`Ban`, `Unban`, `Kick`])
  assert.equal(menu[0].children?.[0].suffixIcon, `fa-user`)
  assert.equal(menu[0].children?.[0].tooltip, `user rules: 1. ban / 2. server message`)
  for (const group of menu) for (const item of group.children ?? []) {
    if (typeof item.action === `function`) await item.action()
  }
  assert.deepEqual(runs, [personal.actions[0], ...team.actions])
  assert.deepEqual(createProfileActionMenuItems(active, async () => {}, { groupByType: true, excludeUnban: true }).map(item => item.name), [`Ban`, `Kick`])
})
