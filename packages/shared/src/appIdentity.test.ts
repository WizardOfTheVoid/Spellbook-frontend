import assert from 'node:assert/strict'
import test from 'node:test'
import { appIdentity, createAppUrl } from './appIdentity'

test(`SpellBook identity is exposed to application consumers`, () => {
  assert.equal(Object.isFrozen(appIdentity), true)
  assert.deepEqual(appIdentity, {
    name: `SpellBook`,
    creator: `Magic Trashcan`,
    credit: `by Magic Trashcan`,
    appId: `com.magictrashcan.spellbook`,
    protocol: `spellbook`
  })
})

test(`SpellBook URLs use supported hosts without an empty query`, () => {
  assert.equal(createAppUrl(`auth`), `spellbook://auth`)
  assert.equal(
    createAppUrl(`auth`, new URLSearchParams({ ticket: `login ticket` })),
    `spellbook://auth?ticket=login+ticket`
  )
  assert.equal(
    createAppUrl(`discord-install`, new URLSearchParams({ status: `error`, teamId: `8` })),
    `spellbook://discord-install?status=error&teamId=8`
  )
})
