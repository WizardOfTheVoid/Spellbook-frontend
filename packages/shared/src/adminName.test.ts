import assert from 'node:assert/strict'
import test from 'node:test'
import { getAdminName } from './adminName.js'

test(`admin names prefer display names and fall back through missing identities`, () => {
  assert.equal(getAdminName({ displayName: ` Moderator `, username: `discord` }), `Moderator`)
  assert.equal(getAdminName({ displayName: ` \t `, username: `discord` }), `discord`)
  assert.equal(getAdminName({ username: `discord` }), `discord`)
  assert.equal(getAdminName(null, `Deleted admin`), `Deleted admin`)
})

test(`admin names require at least three trimmed display name characters`, () => {
  for (const displayName of [undefined, null, ``, ` \t `, `A`, `AB`, ` AB `]) {
    assert.equal(getAdminName({ displayName, username: ` discord ` }), `discord`)
  }
  assert.equal(getAdminName({ displayName: ` ABC `, username: `discord` }), `ABC`)
  assert.equal(getAdminName({ displayName: `AB`, username: ` ` }, `Deleted admin`), `Deleted admin`)
})
