import assert from 'node:assert/strict'
import test from 'node:test'
import { findAppProtocolUrl } from './appProtocol'

test(`protocol discovery returns an auth URL from mixed startup arguments`, () => {
  assert.equal(
    findAppProtocolUrl([`--inspect`, `C:\\SpellBook\\SpellBook.exe`, `spellbook://auth?ticket=login-ticket`]),
    `spellbook://auth?ticket=login-ticket`
  )
})

test(`protocol discovery returns a Discord installation URL from mixed startup arguments`, () => {
  assert.equal(
    findAppProtocolUrl([`--flag`, `spellbook://discord-install?status=success&teamId=8`]),
    `spellbook://discord-install?status=success&teamId=8`
  )
})

test(`protocol discovery rejects malformed and unowned URLs`, () => {
  for (const value of [
    `not a URL`,
    `https://spellbook/auth`,
    `spellbook://unknown?ticket=login-ticket`,
    `spellbook://user@auth?ticket=login-ticket`,
    `spellbook://user:password@discord-install?status=success`,
    `chiv-admin-tool://auth?ticket=legacy`
  ]) {
    assert.equal(findAppProtocolUrl([`--flag`, value]), undefined, value)
  }
})
