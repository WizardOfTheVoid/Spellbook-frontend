import assert from 'node:assert/strict'
import test from 'node:test'
import { prepareAction, validateActionText } from './prepareAction'
import { submittedCommands } from './submittedCommands'
import type { ActionRecipe } from './actionTypes'

const recipe: ActionRecipe = { label: `Ban`, actionDomain: `player`, isEnabled: true, blockOnMissingVariables: true, delayMs: 10, commands: [
  { commandType: `ban`, sortOrder: 1, delayMs: 20, durationHours: 4, offenseType: `hacker`, message: `[user] [duration] [admin]` },
  { commandType: `unban`, sortOrder: 0, delayMs: 5, message: `Cleared` }
] }
const context = { admin: `Admin`, serverName: `Test`, player: { name: `Alice`, playfabId: `PLAYER_1` }, variables: [{ key: `serversay_prefix`, value: `[SB]` }] }

test(`server messages resolve variables once and preserve built-in values`, () => {
  const cases = [
    { message: `[admin_player] warned [user] - [nope] - [prefixed]`, variables: [
      { key: `admin_player`, value: `JohnChivalry` }, { key: `prefixed`, value: `[admin] says` }
    ], expected: `JohnChivalry warned Alice -  - [admin] says` },
    { message: `[loop]`, variables: [{ key: `loop`, value: `[loop] done` }], expected: `[loop] done` },
    { message: `[admin]`, variables: [{ key: `admin`, value: `hijacked` }], expected: `Admin` },
    { message: `[clan_tag]`, variables: [{ key: `clan_tag`, value: `hijacked` }], expected: `TT` }
  ]
  for (const { message, variables, expected } of cases) {
    const result = prepareAction({ ...recipe, actionDomain: `server`, blockOnMissingVariables: false,
      commands: [{ commandType: `server_message`, sortOrder: 0, delayMs: 0, message }] }, { type: `server` },
      { ...context, clanTag: `TT`, variables })
    assert.equal(result.commands[0]!.message, expected)
  }
})

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

test(`Arabic survives message template expansion, prefixes and repeated validation`, () => {
  const result = prepareAction({ ...recipe, actionDomain: `server`, commands: [
    { commandType: `admin_message`, sortOrder: 0, delayMs: 0, message: `[admin]: "[greeting]"` },
    { commandType: `server_message`, sortOrder: 1, delayMs: 0, message: `[server_name]: [greeting]` }
  ] }, { type: `server` }, { ...context, admin: `أحمد`, serverName: `ساحة الفرسان`, variables: [
    { key: `adminsay_prefix`, value: `[الإدارة]` }, { key: `serversay_prefix`, value: `[الخادم]` },
    { key: `greeting`, value: `السَّلَامُ عَلَيْكُمْ، أهلاً!` }
  ] })

  assert.deepEqual(result.commands.map(command => command.message), [
    `[الإدارة] أحمد: 'السَّلَامُ عَلَيْكُمْ، أهلاً!'`,
    `[الخادم] ساحة الفرسان: السَّلَامُ عَلَيْكُمْ، أهلاً!`
  ])
  for (const command of result.commands) assert.equal(validateActionText(command.message), command.message)
})

test(`player announcements still require matching player context and enabled action`, () => {
  assert.throws(() => prepareAction(recipe, { type: `server` }, context), /domain/i)
  assert.throws(() => prepareAction(recipe, { type: `player`, playfabId: `OTHER` }, context), /player/i)
  assert.throws(() => prepareAction({ ...recipe, isEnabled: false }, { type: `player`, playfabId: `PLAYER_1` }, context), /disabled/i)
})

test(`preparation converts quotes from templates, player names and prefixes without changing their sources`, () => {
  const quotedRecipe: ActionRecipe = { ...recipe, commands: [{ ...recipe.commands[0]!, message: `[user] said "[note]" ""` }] }
  const quotedContext = { ...context, player: { ...context.player, name: `Alice "Ace"` }, variables: [
    { key: `serversay_prefix`, value: `[SB "Team"]` }, { key: `note`, value: `Repeat "spam"` }
  ] }
  const original = structuredClone({ recipe: quotedRecipe, context: quotedContext })
  const prepared = prepareAction(quotedRecipe, { type: `player`, playfabId: `PLAYER_1` }, quotedContext)
  assert.equal(prepared.commands[0]!.message, `[SB 'Team'] Alice 'Ace' said 'Repeat 'spam'' ''`)
  assert.equal(prepared.spans[0]!.message, prepared.commands[0]!.message)
  assert.deepEqual({ recipe: quotedRecipe, context: quotedContext }, original)
})

test(`action text converts every double quote while preserving apostrophes and native scripts`, () => {
  assert.equal(validateActionText(`  Said "hello" ""  `), `Said 'hello' ''`)
  assert.equal(validateActionText(`"Caf\u00e9" \u65e5\u672c\u8a9e's`), `'Cafe' \u65e5\u672c\u8a9e's`)
  assert.equal(validateActionText(`${`a`.repeat(178)}""`), `${`a`.repeat(178)}''`)
  assert.equal(validateActionText(``, true), ``)
})

test(`unavailable variables and unsafe concrete messages fail before native execution`, () => {
  for (const message of [`[missing]`, `Bad "\rline`, `Bad "\nline`, `Bad "\0line`, `x`.repeat(181)]) {
    assert.throws(() => prepareAction({ ...recipe, commands: [{ ...recipe.commands[0]!, message }] }, { type: `player`, playfabId: `PLAYER_1` }, context))
  }
  for (const message of [``, `   `, `Bad "\rline`, `Bad "\nline`, `Bad "\0line`, `x`.repeat(181)]) {
    assert.throws(() => validateActionText(message), RangeError)
  }
})
