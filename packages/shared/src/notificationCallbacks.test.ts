import assert from 'node:assert/strict'
import test from 'node:test'
import { parseNotificationCallback } from './notificationCallbacks.js'

test(`accepts callbacks to supported top-level and detail pages`, () => {
  assert.deepEqual(parseNotificationCallback({ label: `Open inbox`, uri: `/notifications` }), {
    label: `Open inbox`,
    uri: `/notifications`
  })
  assert.deepEqual(parseNotificationCallback({ label: `Open team`, uri: `/teams/7` }), {
    label: `Open team`,
    uri: `/teams/7`
  })
  assert.deepEqual(parseNotificationCallback({ label: `Open wanted player`, uri: `/wanted/PLAYFAB_ID` }), {
    label: `Open wanted player`,
    uri: `/wanted/PLAYFAB_ID`
  })
  assert.deepEqual(parseNotificationCallback({ label: `Open player notes`, uri: `/players/PLAYFAB_ID/notes` }), {
    label: `Open player notes`,
    uri: `/players/PLAYFAB_ID/notes`
  })
})

test(`rejects malformed callback routes and external targets`, () => {
  for (const callback of [
    { label: `Bad team`, uri: `/teams/nope` },
    { label: `Bad wanted`, uri: `/wanted/` },
    { label: `Unknown`, uri: `/not-a-page` },
    { label: `Protocol relative`, uri: `//example.test` },
    { label: `Empty team segment`, uri: `/teams//7` },
    { label: `Empty wanted segment`, uri: `/wanted//PLAYFAB_ID` },
    { label: `Bad player subpage`, uri: `/players/PLAYFAB_ID/actions` },
    { label: `Bad player id`, uri: `/players/PLAYFAB.ID/notes` },
    { label: `Absolute`, uri: `https://example.test/notifications` },
    { label: `Missing`, uri: null },
    { label: ``, uri: `/players` },
    { label: `Missing uri` }
  ]) {
    assert.equal(parseNotificationCallback(callback), null)
  }
})
