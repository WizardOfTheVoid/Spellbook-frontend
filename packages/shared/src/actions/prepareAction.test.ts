import assert from 'node:assert/strict'
import test from 'node:test'
import { prepareAction } from './prepareAction'
import { submittedCommands } from './submittedCommands'
import type { ActionRecipe } from './actionTypes'

const recipe: ActionRecipe = { label: `Ban`, actionDomain: `player`, isEnabled: true, blockOnMissingVariables: true, delayMs: 10, commands: [
  { commandType: `ban`, sortOrder: 1, delayMs: 20, durationHours: 4, offenseType: `hacker`, message: `[user] [duration] [admin]` },
  { commandType: `unban`, sortOrder: 0, delayMs: 5, message: `Cleared` }
] }
const context = { admin: `Admin`, serverName: `Test`, player: { name: `Alice`, playfabId: `PLAYER_1` }, variables: [{ key: `serversay_prefix`, value: `[SB]` }] }

test(`preparation sorts commands, adds delays, resolves permanent hacker bans and prefixes once`, () => {
  const result = prepareAction(recipe, { type: `player`, playfabId: `PLAYER_1` }, context)
  assert.deepEqual(result.commands, [
    { commandType: `unban`, message: `[SB] Cleared`, playfabId: `PLAYER_1`, delayMs: 15 },
    { commandType: `ban`, message: `[SB] Alice MAX Admin`, playfabId: `PLAYER_1`, hours: 999999, delayMs: 30 }
  ])
  assert.equal(result.nativeCount, 5)
  assert.deepEqual(submittedCommands(result.spans, 3).map(x => [x.index, x.submittedCount, x.complete]), [[0, 3, false]])
  assert.deepEqual(submittedCommands(result.spans, 5).map(x => [x.index, x.submittedCount, x.complete]), [[0, 4, true], [1, 1, true]])
  assert.throws(() => submittedCommands(result.spans, 6), /count/i)
})

test(`player announcements still require matching player context and enabled action`, () => {
  assert.throws(() => prepareAction(recipe, { type: `server` }, context), /domain/i)
  assert.throws(() => prepareAction(recipe, { type: `player`, playfabId: `OTHER` }, context), /player/i)
  assert.throws(() => prepareAction({ ...recipe, isEnabled: false }, { type: `player`, playfabId: `PLAYER_1` }, context), /disabled/i)
})

test(`unavailable variables and unsafe concrete messages fail before native execution`, () => {
  for (const message of [`[missing]`, `Bad "quote"`, `x`.repeat(181)]) {
    assert.throws(() => prepareAction({ ...recipe, commands: [{ ...recipe.commands[0]!, message }] }, { type: `player`, playfabId: `PLAYER_1` }, context))
  }
})
