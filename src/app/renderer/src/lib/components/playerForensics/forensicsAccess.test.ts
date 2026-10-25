import assert from 'node:assert/strict'
import test from 'node:test'
import { canOpenPlayerForensics } from './forensicsAccess'

test(`only an explicit superadmin role can open forensic data`, () => {
  for (const user of [null, undefined, { isSuperadmin: false }]) {
    assert.equal(canOpenPlayerForensics(user), false)
  }
  assert.equal(canOpenPlayerForensics({ isSuperadmin: true }), true)
})
