import assert from 'node:assert/strict'
import test from 'node:test'
import type { ServerProfileAction, ServerProfileGraph } from '$lib/core'
import { canManageProfile, cloneActions, duplicateAction, duplicateCommand, newProfileDraft, profileChanges, replaceProfileActions, uniqueCopyName, uniqueNewName } from './profileEditor'

const action: ServerProfileAction = {
  id: 10, profileId: 4, label: `Warn`, description: `Rules`, actionDomain: `player`,
  delayMs: 123, sortOrder: 2, isEnabled: false, iconKey: `bullhorn`, blockOnMissingVariables: true,
  commands: [{ id: 20, actionId: 10, commandType: `ban`, sortOrder: 4, delayMs: 45,
    durationHours: 999999, message: `[user], [rules|Be kind]`, offenseType: `other` }]
}
const graph: ServerProfileGraph = {
  profile: { id: 4, owner: { type: `team`, id: 6 }, name: `Clan`, description: `Our rules`, isDefault: false },
  servers: [{ id: 9, profileId: 4, owner: { type: `team`, id: 6 }, gameServerId: 44, gameServerName: `Duel` }],
  availableVariables: [], actions: [action]
}

test(`copies all action settings and nested commands without database identity or shared references`, () => {
  const [copy] = cloneActions([action])
  assert.deepEqual(copy, {
    label: `Warn`, description: `Rules`, actionDomain: `player`, delayMs: 123,
    sortOrder: 0, isEnabled: false, iconKey: `bullhorn`, blockOnMissingVariables: true,
    commands: [{ commandType: `ban`, sortOrder: 0, delayMs: 45, durationHours: 999999,
      message: `[user], [rules|Be kind]`, offenseType: `other` }]
  })
  copy.commands[0].message = `Changed`
  assert.equal(action.commands[0].message, `[user], [rules|Be kind]`)
})

test(`repeated action duplication inserts independent copies with unique names`, () => {
  const first = duplicateAction([action], 0)
  const second = duplicateAction(first, 0)
  assert.deepEqual(second.map(item => item.label), [`Warn`, `Warn (copy 2)`, `Warn (copy)`])
  assert.deepEqual(second.map(item => item.sortOrder), [0, 1, 2])
  assert.equal(second[1].id, undefined)
  assert.notEqual(second[1].commands[0], second[2].commands[0])
})

test(`command duplication preserves settings and inserts after its source`, () => {
  const commands = duplicateCommand(action.commands, 0)
  assert.equal(commands.length, 2)
  assert.equal(commands[1].message, action.commands[0].message)
  assert.equal(commands[1].durationHours, 999999)
  assert.equal(commands[1].id, undefined)
  assert.equal(commands[1].actionId, undefined)
  assert.deepEqual(commands.map(command => command.sortOrder), [0, 1])
})

test(`copy names avoid case and accent collisions and fit the name limit`, () => {
  assert.equal(uniqueCopyName(`Warn`, [`WARN (COPY)`, `Wárn (copy 2)`]), `Warn (copy 3)`)
  const name = uniqueCopyName(`X`.repeat(255), [])
  assert.equal(name.length, 255)
  assert.ok(name.endsWith(` (copy)`))
})

test(`copy names with emoji fit the server's UTF-16 limit without splitting a character`, () => {
  const name = uniqueCopyName(`🎮`.repeat(127), [])
  assert.ok(name.length <= 255)
  assert.equal(name, `${`🎮`.repeat(124)} (copy)`)
})

test(`team permissions become usable after owner loading and still distinguish create from edit`, () => {
  const user = { id: 7, isSuperadmin: false, isActive: true }
  const owner = { type: `team`, id: 6 } as const
  assert.equal(canManageProfile(owner, `edit`, user, []), false)
  const owners = [{ ...owner, name: `Clan`, permissions: [`read`, `create`] }]
  assert.equal(canManageProfile(owner, `create`, user, owners), true)
  assert.equal(canManageProfile(owner, `edit`, user, owners), false)
  assert.equal(canManageProfile(owner, `edit`, user, [{ ...owners[0], permissions: [`admin`] }]), true)
  assert.equal(canManageProfile({ type: `system`, id: 0 }, `edit`, user, owners), false)
  assert.equal(canManageProfile({ type: `system`, id: 0 }, `edit`, { ...user, isSuperadmin: true }, []), true)
  assert.equal(canManageProfile(owner, `create`, { ...user, isActive: false }, owners), false)
})

test(`new action names avoid existing labels with different casing or spaces`, () => {
  assert.equal(uniqueNewName(`New action`, [`NEW ACTION `]), `New action (copy)`)
})

test(`restoring only replaces actions and leaves the destination and source intact`, () => {
  const restored = replaceProfileActions(graph, [])
  assert.deepEqual(restored.actions, [])
  assert.equal(restored.profile, graph.profile)
  assert.equal(restored.servers, graph.servers)
  assert.equal(restored.availableVariables, graph.availableVariables)
  assert.equal(graph.actions.length, 1)
  assert.deepEqual(profileChanges(restored, graph), { actions: [] })
})

test(`cloning into a new owner starts an unassigned non-default profile`, () => {
  const draft = newProfileDraft({ type: `user`, id: 7 }, graph, [`Clan (copy)`])
  assert.deepEqual(draft.profile, {
    id: 0, owner: { type: `user`, id: 7 }, name: `Clan (copy 2)`, description: `Our rules`, isDefault: false
  })
  assert.deepEqual(draft.servers, [])
  assert.deepEqual(draft.availableVariables, [])
  assert.equal(draft.actions[0].id, undefined)
  assert.equal(graph.profile.owner.type, `team`)
})

test(`saving edited commands sends only the changed actions`, () => {
  const draft = replaceProfileActions(graph, graph.actions)
  draft.actions[0].commands[0].message = `New reason`
  const changes = profileChanges(draft, graph)
  assert.deepEqual(Object.keys(changes), [`actions`])
  assert.equal(changes.actions?.[0].commands[0].message, `New reason`)
})
