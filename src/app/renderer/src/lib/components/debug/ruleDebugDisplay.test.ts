import assert from 'node:assert/strict'
import test from 'node:test'
import type { RulesetDebugSnapshot } from '@spellbook/shared/rulesets/ruleDiagnostics'
import { ruleRunDetails, visibleRulePreview } from './ruleDebugDisplay'

type Rule = RulesetDebugSnapshot[`rules`][number]
const run = (code: string | null, message: string | null, sentCommands: number | null): NonNullable<Rule[`lastRun`]> =>
  ({ id: 42, status: `Cancelled`, code, message, sentCommands })

test(`cancellation details expose the cause and submitted command count`, () => {
  assert.equal(ruleRunDetails(run(`ACTION_CANCELLED`, `Action cancelled.`, 0)),
    `Client or Core cancelled execution · ACTION_CANCELLED · 0 commands sent`)
  assert.equal(ruleRunDetails(run(`CONTEXT_CHANGED`, null, 1)),
    `The active server or action worker changed · CONTEXT_CHANGED · 1 command sent`)
  assert.equal(ruleRunDetails(run(`DUPLICATE_ACTIVE_BAN`, `Replaced by ban task #7 with a longer ban.`, 0)),
    `Replaced by ban task #7 with a longer ban. · DUPLICATE_ACTIVE_BAN · 0 commands sent`)
  assert.equal(ruleRunDetails(run(null, null, null)), `Cancelled before execution; no reason recorded`)
})

test(`fixed HUD preview prioritizes cancelled rules and reports omissions`, () => {
  const rule = (id: number, status: Rule[`status`], lastStatus: Rule[`status`] = status) =>
    ({ id, status, lastRun: { ...run(null, null, null), status: lastStatus } }) as Rule
  const rules = [rule(1, `Waiting`), rule(2, `Waiting`), rule(3, `Cancelled`), rule(4, `Waiting`), rule(5, `Waiting`)]
  const preview = visibleRulePreview(rules, 3)
  assert.deepEqual(preview.map(item => item.id), [3, 1, 2])
  assert.equal(rules.length - preview.length, 2)
})
