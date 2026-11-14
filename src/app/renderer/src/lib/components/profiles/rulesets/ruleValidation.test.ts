import assert from 'node:assert/strict'
import test from 'node:test'
import type { RuleDefinition, RulesetRule } from '@spellbook/shared/rulesets/rulesetTypes'
import { ruleErrors } from './ruleValidation'

const definitions: RuleDefinition[] = [
  { key: `Player.offenses`, label: `local offenses`, domain: `player`, valueType: `number`, operators: [`<`, `=`] },
  { key: `System.Time`, label: `Time`, domain: `server`, valueType: `time`, operators: [`=`] }
]
const actions = [{ actionKey: `action`, actionDomain: `player` as const }]
const rule = (): RulesetRule => ({ id: 1, rulesetId: 1, revision: 1, name: `Rule`, description: ``, enabled: true,
  actionKey: `action`, priority: `normal`, freshnessSeconds: 60,
  condition: { mode: `if`, definition: `Player.offenses`, operator: `<`, value: 0 } })

test(`required rule fields accept zero conditions and identify empty or incompatible selections`, () => {
  const draft = rule()
  assert.ok(Object.values(ruleErrors(draft, actions, definitions, `UTC`)).every(error => !error))
  draft.name = ``
  if (draft.condition.mode === `if`) draft.condition.value = ``
  const errors = ruleErrors(draft, actions, definitions, `UTC`)
  assert.ok(errors.name)
  assert.ok(errors.value)
  assert.ok(ruleErrors(rule(), [{ ...actions[0], actionDomain: `server` }], definitions, `UTC`).actionKey)
  assert.ok(ruleErrors(rule(), [], definitions, `UTC`).actionKey)
})

test(`interval validation rejects cleared, fractional, zero and oversized intervals`, () => {
  for (const amount of [NaN, 0, 0.5, 10081]) {
    assert.ok(ruleErrors({ ...rule(), condition: { mode: `each`, amount, unit: `minute` } }, actions, definitions, `UTC`).amount)
  }
  assert.ok(!ruleErrors({ ...rule(), condition: { mode: `each`, amount: 1, unit: `hour` } }, actions, definitions, `UTC`).amount)
})

test(`date input errors block the saved value and require a loaded timezone`, () => {
  const draft = { ...rule(), condition: { mode: `if` as const, definition: `System.Time` as const, operator: `=` as const, value: `00:00` } }
  const serverActions = [{ ...actions[0], actionDomain: `server` as const }]
  assert.ok(!ruleErrors(draft, serverActions, definitions, `UTC`).value)
  assert.ok(ruleErrors(draft, serverActions, definitions, null).value)
  assert.equal(ruleErrors(draft, serverActions, definitions, `UTC`, `Invalid local time`).value, `Invalid local time`)
})
