import assert from 'node:assert/strict'
import test from 'node:test'
import { applyServerMessagePrefix } from './actions/prepareAction.js'
import { slugVariableLabel, variableErrors, variableKeyError, withFixedVariableDefinitions } from './teamVariables.js'
import { emptyTeamSettings, resolveTeamDefaults } from './teamSettings.js'

test(`variable names normalize consistently and reject ambiguous or reserved tags`, () => {
  assert.equal(slugVariableLabel(` Café Rules! `), `cafe_rules`)
  assert.equal(variableKeyError(`Rules URL`, []), null)
  for (const label of [``, `!!`, `2 Fast`, `Admin`, `Clan Name`, `Discord URL`, `Adminsay Prefix`, `Serversay Prefix`, `A`.repeat(33)]) {
    assert.ok(variableKeyError(label, []), label)
  }
  assert.ok(variableKeyError(`Rules!`, [`rules`]))
  assert.deepEqual(variableErrors([{ label: `Rules`, key: `rules` }, { label: `Rules!`, key: `rules` }]).map(Boolean), [true, true])
})

test(`fixed definitions remain unique and first custom definitions win`, () => {
  assert.deepEqual(withFixedVariableDefinitions([
    { label: `Override`, key: `discord_url` }, { label: `Rules`, key: `rules` }, { label: `Other`, key: `rules` }
  ]), [
    { label: `Discord URL`, key: `discord_url` }, { label: `Adminsay prefix`, key: `adminsay_prefix` },
    { label: `Serversay prefix`, key: `serversay_prefix` }, { label: `Rules`, key: `rules` }
  ])
})

test(`Team Discord and global prefixes take precedence over fixed values in stored Team variables`, () => {
  const team = { ...emptyTeamSettings(`Knights`), discordUrl: `https://discord.gg/team`, variables: [
    { label: `Discord`, key: `discord_url`, value: `old` },
    { label: `Prefix`, key: `serversay_prefix`, value: `old` },
    { label: `Rules`, key: `rules`, value: `` }
  ] }
  const result = resolveTeamDefaults({ clanName: null, clanTag: null }, team, `[SB] `)
  assert.deepEqual(Object.fromEntries(result.variables.map(variable => [variable.key, variable.value])), {
    discord_url: team.discordUrl, adminsay_prefix: `[SB] `, serversay_prefix: `[SB] `, rules: ``
  })
  assert.equal(team.variables[0].value, `old`)
  assert.deepEqual(resolveTeamDefaults({ clanName: null, clanTag: null }, null, `[SB] `).variables.map(variable => variable.value), [``, `[SB] `, `[SB] `])
})

test(`message prefixes add one separating space only when a prefix exists`, () => {
  for (const [prefix, expected] of [[`[SB]`, `[SB] Hello`], [`[SB]  `, `[SB] Hello`], [``, `Hello`], [`   `, `Hello`]]) {
    assert.equal(applyServerMessagePrefix(`Hello`, `server`, [{ key: `serversay_prefix`, value: prefix }]), expected)
  }
  assert.equal(applyServerMessagePrefix(`Hello`, `admin`, [{ key: `adminsay_prefix`, value: `Admin:` }]), `Admin: Hello`)
})
