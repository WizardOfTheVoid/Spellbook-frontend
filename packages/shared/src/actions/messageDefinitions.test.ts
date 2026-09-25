import assert from 'node:assert/strict'
import test from 'node:test'
import { prepareAction } from './prepareAction'
import type { ActionRecipe } from './actionTypes'
import { defaultTagDefinitions } from './tagTypeDefinitions'

const commands = [
  { commandType: `ban` as const, sortOrder: 0, delayMs: 0, durationHours: 4, offenseType: `verbal_abuse`, message: `Reason` },
  { commandType: `server_message` as const, sortOrder: 1, delayMs: 0, message: `[user] was [offense_type_pt] for [offense_type]. Their [offenses_alt] offense. [action_type]` }
]
const recipe: ActionRecipe = { label: `Moderate`, actionDomain: `player`, delayMs: 0, isEnabled: true, blockOnMissingVariables: true, commands }
const context = { admin: `Admin`, serverName: `Test`, player: { name: `Alice`, playfabId: `PLAYER_1` }, offenses: 3 }
const target = { type: `player` as const, playfabId: `PLAYER_1` }

test(`message tags resolve server counts and player statistics including zero values`, () => {
  const message = `[admins_online]/[players_online] rank [player_rank], [playtime] hours, [last_login_alt], [offenses] offenses`
  const result = prepareAction({ ...recipe, commands: [{ ...commands[1], message }] }, target, {
    ...context, adminsOnline: 0, playersOnline: 12, playerRank: 0, playtimeHours: 12.5,
    lastLogin: `2026-09-01T12:00:00Z`, now: `2026-09-21T12:00:00Z`
  })
  assert.equal(result.commands[0].message, `0/12 rank 0, 12.5 hours, 20 days ago, 3 offenses`)
})

test(`message tags cap players online at server capacity and expose serverSlot to both message kinds`, () => {
  for (const commandType of [`server_message`, `admin_message`] as const) {
    const result = prepareAction({ ...recipe, actionDomain: `server`, commands: [
      { commandType, sortOrder: 0, delayMs: 0, message: `[players_online]/[serverSlot]` }
    ] }, { type: `server` }, { ...context, playersOnline: 43, serverSlot: 40 })
    assert.equal(result.commands[0].message, `40/40`)
  }
})

test(`unknown statistics use template fallbacks instead of invented zeroes`, () => {
  const message = `[players_online|unknown] [player_rank|unknown] [playtime|unknown] [last_login|unknown]`
  assert.equal(prepareAction({ ...recipe, commands: [{ ...commands[1], message }] }, target, context).commands[0].message,
    `unknown unknown unknown unknown`)
})

test(`current time uses the admin timezone and UTC at the same instant`, () => {
  const message = `[current_time] / [current_time_utc]`
  const result = prepareAction({ ...recipe, commands: [{ ...commands[1], message }] }, target,
    { ...context, timezone: `Europe/Oslo`, now: `2026-09-21T12:34:56Z` })
  assert.equal(result.commands[0].message, `14:34:56 / 12:34:56`)
})

test(`announcement tags inherit the preceding moderation command and pretty offense reason`, () => {
  assert.equal(prepareAction(recipe, target, context).commands[1].message,
    `Alice was banned for Verbal Abuse. Their 3rd offense. Ban`)
})

test(`ordinal variant handles teen exceptions and repeated suffixes`, () => {
  for (const [offenses, expected] of [[0, `0th`], [1, `1st`], [2, `2nd`], [3, `3rd`], [4, `4th`], [11, `11th`], [12, `12th`], [13, `13th`], [21, `21st`], [112, `112th`]] as const) {
    const result = prepareAction({ ...recipe, commands: [{ ...commands[0], message: `[offenses_alt]` }] }, target, { ...context, offenses })
    assert.equal(result.commands[0].message, expected)
  }
})

test(`announcement without moderation context uses explicit fallback without borrowing a later ban`, () => {
  const result = prepareAction({ ...recipe, commands: [
    { ...commands[1], sortOrder: 0, message: `[offense_type|No reason] [action_type_pt|pending]` },
    { ...commands[0], sortOrder: 1 }
  ] }, target, context)
  assert.equal(result.commands[0].message, `No reason pending`)
})

test(`catalog wording is applied from the supplied execution snapshot`, () => {
  const definitions = [
    { group: `action` as const, slug: `ban`, name: `Ban`, alt: null, pastTense: `excluded`, revision: 2 },
    { group: `offense` as const, slug: `verbal_abuse`, name: `Abusive language`, alt: null, pastTense: null, revision: 2 }
  ]
  assert.equal(prepareAction(recipe, target, { ...context, tagDefinitions: definitions }).commands[1].message,
    `Alice was excluded for Abusive language. Their 3rd offense. Ban`)
})

test(`Adminsay prepares its own prefix and does not require a player target`, () => {
  const result = prepareAction({ ...recipe, actionDomain: `server`, commands: [
    { commandType: `admin_message`, sortOrder: 0, delayMs: 0, message: `[admin] says hello` }
  ] }, { type: `server` }, { ...context, variables: [
    { key: `adminsay_prefix`, value: `[A] ` }, { key: `serversay_prefix`, value: `[S] ` }
  ] })
  assert.equal(result.commands[0].message, `[A] Admin says hello`)
})

test(`disabled variants use explicit fallbacks and cannot be shadowed by a server variable`, () => {
  const tagDefinitions = defaultTagDefinitions.map(row => row.group === `tag` && row.slug === `offenses` ? { ...row, alt: null } : row)
  const result = prepareAction({ ...recipe, commands: [{ ...commands[0], message: `[offenses_alt|next]` }] }, target,
    { ...context, tagDefinitions, variables: [{ key: `offenses_alt`, value: `wrong` }] })
  assert.equal(result.commands[0].message, `next`)
})
