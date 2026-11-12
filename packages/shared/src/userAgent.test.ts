import assert from 'node:assert/strict'
import test from 'node:test'
import { createUserAgent } from './userAgent'

test(`formats product versions, sending components and optional account identity`, () => {
  for (const component of [`client`, `core`, `api`, `discord`] as const) {
    assert.equal(createUserAgent(component, null, `1.2.3`), `TWA-SpellBook/1.2.3 (component=${component})`)
  }
  assert.equal(createUserAgent(`client`, 42, `1.2.3`), `TWA-SpellBook/1.2.3 (component=client; userId=42)`)
  assert.equal(createUserAgent(`client`, 42, `1.2.3`, `Magic`), `TWA-SpellBook/1.2.3 (component=client; userId=42; username=Magic)`)
  assert.equal(createUserAgent(`client`, 42, `1.2.3`, `   `), `TWA-SpellBook/1.2.3 (component=client; userId=42)`)
  const header = new Headers({ [`User-Agent`]: createUserAgent(`client`, 42, `1.2.3`, `Jønas (admin);\r\n`) })
  assert.equal(header.get(`User-Agent`), `TWA-SpellBook/1.2.3 (component=client; userId=42; username=J%C3%B8nas%20%28admin%29%3B)`)
})

test(`omits invalid account IDs from request metadata`, () => {
  for (const userId of [null, 0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(createUserAgent(`client`, userId, `1.2.3`), `TWA-SpellBook/1.2.3 (component=client)`)
  }
})
