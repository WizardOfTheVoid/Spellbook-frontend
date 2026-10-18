import assert from 'node:assert/strict'
import test from 'node:test'
import { createUserAgent } from './userAgent'

test(`formats product versions, sending components and optional account IDs`, () => {
  for (const component of [`client`, `core`, `api`, `discord`] as const) {
    assert.equal(createUserAgent(component, null, `1.2.3`), `TWA-SpellBook/1.2.3 (component=${component})`)
  }
  assert.equal(createUserAgent(`client`, 42, `1.2.3`), `TWA-SpellBook/1.2.3 (component=client; userId=42)`)
})

test(`omits invalid account IDs from request metadata`, () => {
  for (const userId of [null, 0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(createUserAgent(`client`, userId, `1.2.3`), `TWA-SpellBook/1.2.3 (component=client)`)
  }
})
