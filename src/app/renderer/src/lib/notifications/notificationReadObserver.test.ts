import assert from 'node:assert/strict'
import test from 'node:test'
import { observeNotificationRead } from './notificationReadObserver'

function fixture(markRead: () => Promise<void>) {
  const node = new EventTarget() as HTMLElement
  const action = observeNotificationRead(node, { active: true, read: false, markRead })
  return {
    action,
    enter: () => node.dispatchEvent(new Event(`mouseenter`)),
    leave: () => node.dispatchEvent(new Event(`mouseleave`)),
  }
}

test(`requires 500 continuous milliseconds of hover and marks only once`, async context => {
  context.mock.timers.enable({ apis: [`setTimeout`] })
  let calls = 0
  const view = fixture(async () => { calls += 1 })
  context.mock.timers.tick(500)
  assert.equal(calls, 0)
  view.enter()
  context.mock.timers.tick(499)
  assert.equal(calls, 0)
  view.leave()
  context.mock.timers.tick(500)
  assert.equal(calls, 0)
  view.enter()
  context.mock.timers.tick(499)
  assert.equal(calls, 0)
  context.mock.timers.tick(1)
  assert.equal(calls, 1)
  await Promise.resolve()
  view.leave()
  view.enter()
  context.mock.timers.tick(500)
  assert.equal(calls, 1)
  view.action.destroy()
})

test(`inactive, read, and destroyed notifications cancel pending hover reads`, context => {
  context.mock.timers.enable({ apis: [`setTimeout`] })
  let calls = 0
  const markRead = async () => { calls += 1 }
  for (const state of [`inactive`, `read`, `destroyed`]) {
    const view = fixture(markRead)
    view.enter()
    context.mock.timers.tick(250)
    if (state === `destroyed`) view.action.destroy()
    else view.action.update({ active: state !== `inactive`, read: state === `read`, markRead })
    context.mock.timers.tick(500)
    view.enter()
    context.mock.timers.tick(500)
    view.action.destroy()
  }
  assert.equal(calls, 0)
})

test(`failed reads retry after a full hover without duplicate pending requests`, async context => {
  context.mock.timers.enable({ apis: [`setTimeout`] })
  let calls = 0
  let reject!: (error: Error) => void
  const request = new Promise<void>((_resolve, nextReject) => { reject = nextReject })
  const view = fixture(async () => {
    calls += 1
    await request
  })
  view.enter()
  context.mock.timers.tick(500)
  view.leave()
  view.enter()
  context.mock.timers.tick(500)
  assert.equal(calls, 1)
  reject(new Error(`offline`))
  await new Promise(resolve => setImmediate(resolve))
  view.leave()
  view.enter()
  context.mock.timers.tick(499)
  assert.equal(calls, 1)
  context.mock.timers.tick(1)
  assert.equal(calls, 2)
  view.action.destroy()
})

test(`manual unread stays unread and a later eligible hover can mark it read again`, async context => {
  context.mock.timers.enable({ apis: [`setTimeout`] })
  let calls = 0
  const markRead = async () => { calls += 1 }
  const view = fixture(markRead)
  view.enter()
  context.mock.timers.tick(500)
  await Promise.resolve()
  view.action.update({ active: true, read: true, markRead })
  view.action.update({ active: false, read: false, markRead })
  view.leave()
  view.enter()
  context.mock.timers.tick(500)
  assert.equal(calls, 1)
  view.leave()
  view.action.update({ active: true, read: false, markRead })
  view.enter()
  context.mock.timers.tick(500)
  assert.equal(calls, 2)
  view.action.destroy()
})
