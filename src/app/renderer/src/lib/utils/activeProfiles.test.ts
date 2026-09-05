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
