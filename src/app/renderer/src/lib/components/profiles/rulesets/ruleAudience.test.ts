import assert from 'node:assert/strict'
import test from 'node:test'
import type { ServerProfileAction } from '$lib/core'
import type { RuleDefinition, RulesetRule } from '@spellbook/shared/rulesets/rulesetTypes'
import { actionKeyForScope, ruleActionWarning, ruleHasSelectableAction, ruleRunScope } from './rulesetEditor'

const action: ServerProfileAction = {
  actionKey: `player-action`, label: `Ruleset`, actionDomain: `player`, delayMs: 0,
  sortOrder: 0, isEnabled: true, iconKey: `circle-info`, blockOnMissingVariables: false,
  commands: [{ commandType: `server_message`, sortOrder: 0, delayMs: 0, message: `Rules` }]
}
const serverAction: ServerProfileAction = { ...action, actionKey: `server-action`, actionDomain: `server` }
const rule: RulesetRule = { id: 1, rulesetId: 2, name: `Rules`, description: ``, enabled: true,
  actionKey: `player-action`, priority: `normal`, freshnessSeconds: 60, revision: 1,
  condition: { mode: `each`, amount: 5, unit: `minute` } }
test(`existing scheduled rules derive their scope from the selected action`, () => {
  assert.equal(ruleRunScope(rule, [action, serverAction]), `player`)
  assert.equal(ruleRunScope({ ...rule, actionKey: `server-action` }, [action, serverAction]), `server`)
  assert.equal(ruleRunScope({ ...rule, actionKey: `missing` }, [action, serverAction]), null)
})

test(`switching scope clears an incompatible action without choosing another`, () => {
  assert.equal(actionKeyForScope(`player-action`, `server`, [action, serverAction]), ``)
  assert.equal(actionKeyForScope(`player-action`, `player`, [action, serverAction]), `player-action`)
  assert.equal(actionKeyForScope(`missing`, `player`, [action, serverAction]), ``)
})

test(`scheduled player actions warn once per listed player and count broadcast commands`, () => {
  const messages = { ...action, commands: [
    action.commands[0],
    { commandType: `admin_message` as const, sortOrder: 1, delayMs: 0, message: `Admins` }
  ] }
  assert.deepEqual(ruleActionWarning(rule, messages), { perPlayer: true, broadcastCount: 2 })
  assert.deepEqual(ruleActionWarning(rule, { ...action, commands: [] }), { perPlayer: true, broadcastCount: 0 })
  assert.equal(ruleActionWarning(rule, serverAction), null)
})

test(`matching player rules warn for broadcasts but ordinary target actions stay neutral`, () => {
  const conditional: RulesetRule = { ...rule, condition: { mode: `if`, definition: `Player.rank`, operator: `<`, value: 50 } }
  assert.deepEqual(ruleActionWarning(conditional, action), { perPlayer: false, broadcastCount: 1 })
  assert.equal(ruleActionWarning(conditional, { ...action, commands: [] }), null)
})

test(`a rule requires an existing action matching its condition domain`, () => {
  const definitions: RuleDefinition[] = [{ key: `Player.rank`, label: `Rank`, domain: `player`, valueType: `number`, operators: [`<`] }]
  assert.equal(ruleHasSelectableAction(rule, [action, serverAction], definitions), true)
  assert.equal(ruleHasSelectableAction({ ...rule, actionKey: `` }, [action, serverAction], definitions), false)
  const conditional: RulesetRule = { ...rule, condition: { mode: `if`, definition: `Player.rank`, operator: `<`, value: 50 } }
  assert.equal(ruleHasSelectableAction(conditional, [action, serverAction], definitions), true)
  assert.equal(ruleHasSelectableAction({ ...conditional, actionKey: `server-action` }, [action, serverAction], definitions), false)
})
