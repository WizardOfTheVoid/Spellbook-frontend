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
