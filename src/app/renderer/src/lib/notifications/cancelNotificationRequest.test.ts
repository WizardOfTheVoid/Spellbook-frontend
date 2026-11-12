import assert from 'node:assert/strict'
import test from 'node:test'
import type { NotificationRecord } from '@spellbook/shared/notifications'
import { cancelNotificationRequest, clickedRequestCancels } from './cancelNotificationRequest'
import { notificationEvents } from './notificationEvents'
import type { NotificationRequest } from './notificationTypes'

test(`notification cancellation sends the request ID and reports a too-late outcome`, async t => {
  clickedRequestCancels.set(new Set())
  const previous = Object.getOwnPropertyDescriptor(globalThis, `window`)
  const calls: unknown[] = []
  const notices: NotificationRequest[] = []
  let status = `cancelled`
  Object.defineProperty(globalThis, `window`, { configurable: true, value: { chivServer: {
    actions: async (operation: string, input: unknown) => {
      calls.push([operation, input])
      return { ok: true, data: { ok: true, data: { status } } }
    },
  } } })
  const stop = notificationEvents.listen(notice => notices.push(notice))
  t.after(() => {
    stop()
    if (previous) Object.defineProperty(globalThis, `window`, previous)
    else Reflect.deleteProperty(globalThis, `window`)
  })
  const notification = { source: `action-request`, callback: { label: `Cancel`, uri: `/requests/42/cancel` } } as Pick<NotificationRecord, `source` | `callback`>
  assert.equal(await cancelNotificationRequest(notification), true)
  assert.deepEqual(calls, [[`cancel`, { id: 42 }]])
  assert.equal(notices[0]?.level, `success`)
  await cancelNotificationRequest(notification)
  assert.equal(calls.length, 1)
  notification.callback!.uri = `/requests/43/cancel`
  status = `completed`
  await cancelNotificationRequest(notification)
  assert.equal(notices[1]?.level, `warning`)
  assert.ok(notices[1]?.message.includes(status))
  assert.equal(await cancelNotificationRequest({ ...notification, source: `other` }), false)
  assert.equal(calls.length, 2)
})
