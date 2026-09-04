import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveNotificationPollMs } from './notificationPollingConfig'

test('missing notification poll setting defaults to twelve seconds', () => {
  assert.equal(resolveNotificationPollMs({}), 12_000)
})

test('positive integer notification poll seconds become milliseconds', () => {
  assert.equal(resolveNotificationPollMs({ NOTIFICATION_POLL_SECONDS: '45' }), 45_000)
})

test('invalid notification poll seconds are rejected', () => {
  for (const value of ['0', '-1', '1.5', 'invalid']) {
    assert.throws(
      () => resolveNotificationPollMs({ NOTIFICATION_POLL_SECONDS: value }),
      /NOTIFICATION_POLL_SECONDS/u
    )
  }
})
