import assert from 'node:assert/strict'
import test from 'node:test'
import {
  customVariableRows,
  fixedVariableRows,
  isFixedVariableKey,
  serverVariableKeyError,
  slugServerVariableLabel,
  variableTagEntries
} from './serverVariables'

test(`server variable helpers preserve slug and fixed-row behavior`, () => {
  assert.equal(slugServerVariableLabel(` Admin Player `), `admin_player`)
  assert.equal(isFixedVariableKey(`discord_url`), true)
  assert.equal(serverVariableKeyError(`Admin`, []), `[admin] is a reserved tag.`)
  const rows = [
    { id: 1, gameServerId: 7, label: `Website`, key: `website`, value: `url`, sortOrder: 0 }
  ]
  assert.deepEqual(fixedVariableRows(rows).map(row => [row.key, row.value]), [
    [`discord_url`, ``], [`adminsay_prefix`, ``], [`serversay_prefix`, ``]
  ])
  assert.deepEqual(customVariableRows(rows).map(row => row.key), [`website`])
})

test(`creates tag entries from definition-only variables`, () => {
  assert.deepEqual(variableTagEntries([
    { label: `Rules URL`, key: `rules_url` }
  ]), [{ tag: `[rules_url]`, label: `Rules URL` }])
})
