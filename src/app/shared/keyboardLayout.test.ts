import assert from 'node:assert/strict'
import test from 'node:test'
import { isKeyboardLayoutId } from './keyboardLayout'

test(`layout identities accept only nonzero eight-digit KLIDs`, () => {
  for (const id of [`00000409`, `00000414`, `a0000409`]) assert.equal(isKeyboardLayoutId(id), true)
  for (const id of [`00000000`, `409`, `0x00000409`, `detect`, `US`, null, 409]) assert.equal(isKeyboardLayoutId(id), false)
})
