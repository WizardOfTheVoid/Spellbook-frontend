import assert from 'node:assert/strict'
import test from 'node:test'
import { defaultTagDefinitions } from '@spellbook/shared/actions/tagTypeDefinitions.js'
import { messageLegendItems } from './messageLegend'

test(`legend includes supported variants and hides inapplicable player context in Quick Actions`, () => {
  const context = { offenses: `11`, actionType: `kick`, offenseType: `ffa`, admin: `Admin`, serverName: `Test` }
  const profile = messageLegendItems(defaultTagDefinitions, context, { player: true, authoring: true })
  assert.equal(profile.find(item => item.tag === `[offenses_alt]`)?.example, `11th`)
  assert.equal(profile.find(item => item.tag === `[offense_type]`)?.example, `FFA`)
  assert.equal(profile.find(item => item.tag === `[offense_type_pt]`)?.example, `kicked`)
  assert.equal(profile.some(item => item.tag === `[user_pt]`), false)
  const quick = messageLegendItems(defaultTagDefinitions, context, { player: false, authoring: false })
  for (const tag of [`[offenses_alt]`, `[offense_type_pt]`, `[action_type_pt]`]) {
    assert.equal(quick.some(item => item.tag === tag), false)
  }
  assert.equal(quick.find(item => item.tag === `[clan_name]`)?.disabled, true)
})

test(`disabling an optional variant removes its insertion option`, () => {
  const definitions = defaultTagDefinitions.map(row => row.group === `tag` && row.slug === `offenses` ? { ...row, alt: null } : row)
  assert.equal(messageLegendItems(definitions, { offenses: `3` }, { player: true, authoring: true }).some(item => item.tag === `[offenses_alt]`), false)
})


test(`variable examples use available context and mock only missing values`, () => {
  const items = messageLegendItems(defaultTagDefinitions, { admin: `magic`, serverName: `Duel`, clanName: `Knights`, clanTag: `KT`, user: `` }, { player: true, authoring: true })
  const example = (tag: string) => items.find(item => item.tag === `[${tag}]`)?.example
  assert.equal(example(`admin`), `magic`)
  assert.equal(example(`server_name`), `Duel`)
  assert.equal(example(`clan_name`), `Knights`)
  assert.equal(example(`clan_tag`), `KT`)
  assert.equal(example(`user`), `Samwise`)
  assert.equal(example(`offenses_alt`), `3rd`)
})


test(`server command builders hide player variables and their variants`, () => {
  const items = messageLegendItems(defaultTagDefinitions, {}, { player: false, authoring: true })
  for (const tag of [`player_rank`, `last_login`, `last_login_alt`, `playtime`, `user`, `duration`, `playfab`, `offenses`, `offenses_alt`, `offense_type`, `offense_type_pt`, `action_type`, `action_type_pt`]) {
    assert.equal(items.some(item => item.tag === `[${tag}]`), false)
  }
  assert.equal(items.find(item => item.tag === `[admin]`)?.disabled, false)
  assert.equal(items.find(item => item.tag === `[server_name]`)?.disabled, false)
})
