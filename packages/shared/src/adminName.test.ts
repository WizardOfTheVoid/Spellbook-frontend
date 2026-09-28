import assert from 'node:assert/strict'
import test from 'node:test'
import { getAdminName } from './adminName.js'

test(`admin names prefer display names and fall back through missing identities`, () => {
  assert.equal(getAdminName({ displayName: ` Moderator `, username: `discord` }), `Moderator`)
  assert.equal(getAdminName({ displayName: ` \t `, username: `discord` }), `discord`)
  assert.equal(getAdminName({ username: `discord` }), `discord`)
  assert.equal(getAdminName(null, `Deleted admin`), `Deleted admin`)
})
