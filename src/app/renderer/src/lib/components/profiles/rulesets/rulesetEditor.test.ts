import assert from 'node:assert/strict'
import test from 'node:test'
import type { Ruleset, RulesetRule } from '@spellbook/shared/rulesets/rulesetTypes'
import { applyRulesetDraft, saveRulesetDraft } from './rulesetEditor'

const rule: RulesetRule = { id: 1, rulesetId: 2, name: `Old`, description: ``, enabled: true, actionKey: `action`, priority: `high`, freshnessSeconds: 60, revision: 1,
  condition: { mode: `each`, amount: 2, unit: `minute` } }
const original: Ruleset = { id: 2, profileId: 3, enabled: true, paused: false, rules: [rule] }

test(`saving an IF draft preserves both trigger modes and its caller-provided timestamp`, async () => {
  for (const triggerOnce of [true, false]) {
    const condition = { mode: `if` as const, definition: `Player.lastLogin` as const, operator: `<` as const, value: `2026-09-21T14:30:45+02:00`, triggerOnce }
    const draft = { ...rule, condition }
    const saved = await saveRulesetDraft(original, draft, 0, async value => structuredClone(value))
    assert.deepEqual(saved.rules[0].condition, condition)
    await assert.rejects(saveRulesetDraft(original, draft, 0, async () => { throw new Error(`Offline`) }))
    assert.deepEqual(draft.condition, condition)
  }
})

test(`saving the ruleset includes the open rule draft and normalizes priority`, async () => {
  const draft = { ...rule, name: `Edited`, condition: { mode: `each` as const, amount: 5, unit: `hour` as const } }
  let persisted: Ruleset | undefined
  const saved = await saveRulesetDraft(original, draft, 0, async value => { persisted = structuredClone(value); return value })
  assert.equal(persisted?.rules[0].name, `Edited`)
  assert.deepEqual(saved.rules[0].condition, draft.condition)
  assert.equal(saved.rules[0].priority, `normal`)
  assert.equal(original.rules[0].name, `Old`)
})

test(`new rules are included once and failed saves retain the draft`, async () => {
  const draft = { ...rule, id: 0, name: `New` }
  await assert.rejects(saveRulesetDraft(original, draft, -1, async () => { throw new Error(`Offline`) }), /Offline/u)
  assert.equal(draft.name, `New`)
  const saved = await saveRulesetDraft(original, draft, -1, async value => value)
  assert.deepEqual(saved.rules.map(rule => rule.name), [`Old`, `New`])
  assert.equal(original.rules.length, 1)
})


test(`leaving a rule retains edits in the ruleset without changing the saved snapshot`, () => {
  const draft = { ...rule, name: `Edited` }
  const next = applyRulesetDraft(original, draft, 0)
  assert.equal(next.rules[0].name, `Edited`)
  assert.equal(original.rules[0].name, `Old`)
  assert.equal(applyRulesetDraft(next, null, 0), next)
})

test(`leaving a new rule appends it to the pending ruleset`, () => {
  const next = applyRulesetDraft(original, { ...rule, id: 0, name: `New` }, -1)
  assert.deepEqual(next.rules.map(rule => rule.name), [`Old`, `New`])
  assert.equal(original.rules.length, 1)
})
