import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveIncrementalBan, validateIncrementalBan } from './incrementalBan'
import { prepareAction } from './prepareAction'
import type { ActionCommand, ActionRecipe } from './actionTypes'

const settings = { windowDays: 30 as const, offenseTypes: null, stages: [
  { banCount: 10, durationHours: 999999 }, { banCount: 1, durationHours: 24 }, { banCount: 4, durationHours: 72 }
] }
const command: ActionCommand = { commandType: `incremental_ban`, sortOrder: 0, delayMs: 0,
  message: `[action_type] for [duration]`, offenseType: `griefing`, incrementalBan: settings }

test(`selects thresholds using prior bans plus the ban being issued`, () => {
  for (const [prior, hours] of [[0, 24], [2, 24], [3, 72], [8, 72], [9, 999999], [100, 999999]]) {
    const resolved = resolveIncrementalBan(command, prior)
    assert.equal(resolved.commandType, `ban`)
    assert.equal(resolved.durationHours, hours)
    assert.equal(resolved.incrementalBan, undefined)
  }
  assert.equal(command.commandType, `incremental_ban`)
  assert.equal(settings.stages[0].banCount, 10)
})

test(`normalizes settings without sharing stage or offense arrays`, () => {
  const input = { ...settings, offenseTypes: [`griefing`, `ffa`, `griefing`] }
  const result = validateIncrementalBan(input)
  assert.deepEqual(result.stages.map(stage => stage.banCount), [1, 4, 10])
  assert.deepEqual(result.offenseTypes, [`ffa`, `griefing`])
  result.stages[0].durationHours = 12
  result.offenseTypes!.push(`other`)
  assert.equal(input.stages[1].durationHours, 24)
  assert.equal(input.offenseTypes.length, 3)
})

test(`rejects invalid settings and unavailable counts instead of choosing a fallback`, () => {
  for (const invalid of [null, {}, { ...settings, windowDays: 60 }, { ...settings, offenseTypes: [] },
    { ...settings, offenseTypes: [`invented`] }, { ...settings, stages: [] },
    { ...settings, stages: [{ banCount: 2, durationHours: 24 }] },
    { ...settings, stages: [{ banCount: 1, durationHours: 24 }, { banCount: 1, durationHours: 72 }] },
    ...[0, 1.5, 1000000, NaN].map(durationHours => ({ ...settings, stages: [{ banCount: 1, durationHours }] }))]) {
    assert.throws(() => validateIncrementalBan(invalid), RangeError)
  }
  for (const count of [-1, 1.5, NaN]) assert.throws(() => resolveIncrementalBan(command, count), RangeError)
})

test(`resolved bans supply their actual duration to following messages and the native command`, () => {
  const recipe: ActionRecipe = { label: `Escalate`, actionDomain: `player`, delayMs: 0, isEnabled: true,
    blockOnMissingVariables: false, commands: [resolveIncrementalBan(command, 9),
      { commandType: `server_message`, sortOrder: 1, delayMs: 0, message: `[action_type] [duration]` }] }
  const prepared = prepareAction(recipe, { type: `player`, playfabId: `PLAYER_1` },
    { admin: `Admin`, serverName: `Server`, player: { playfabId: `PLAYER_1`, name: `Alice` } })
  assert.equal(prepared.commands[0].hours, 999999)
  assert.equal(prepared.commands[1].message, `Ban MAX`)
  assert.equal(prepared.spans[0].command.commandType, `ban`)
  assert.equal(prepared.spans[0].command.durationHours, 999999)
})

test(`native preparation rejects unresolved incremental bans`, () => {
  assert.throws(() => prepareAction({ label: `Escalate`, actionDomain: `player`, delayMs: 0, isEnabled: true,
    blockOnMissingVariables: false, commands: [command] }, { type: `player`, playfabId: `PLAYER_1` },
  { admin: `Admin`, serverName: `Server`, player: { playfabId: `PLAYER_1`, name: `Alice` } }), /resolved/)
})
