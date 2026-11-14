import assert from 'node:assert/strict'
import test from 'node:test'
import { EventEmitter } from 'node:events'
import type { IpcMainInvokeEvent } from 'electron'
import { PlayerSearchRequests } from './playerSearchRequests'

const request = (requestId: string, scopeId = `archive-one`) => ({ requestId, scopeId })
function event(sender = new EventEmitter(), routingId = 1) {
  return { sender, frameId: routingId, processId: 1, senderFrame: { routingId, processId: 1 } } as unknown as IpcMainInvokeEvent
}

test(`replacement cancels only the same window, frame and archive`, async () => {
  const requests = new PlayerSearchRequests()
  const owner = event()
  const pending = Promise.withResolvers<void>()
  const signals: AbortSignal[] = []
  const work = async (signal?: AbortSignal) => { signals.push(signal!); await pending.promise }
  const jobs = [
    requests.run(owner, request(`request-old`), work),
    requests.run(event(owner.sender, 2), request(`request-frame`), work),
    requests.run(event(), request(`request-window`), work),
    requests.run(owner, request(`request-other`, `archive-two`), work),
    requests.run(owner, request(`request-new`), work)
  ]
  assert.deepEqual(signals.map(signal => signal.aborted), [true, false, false, false, false])
  requests.cancel(owner, request(`request-old`))
  assert.equal(signals[4]!.aborted, false)
  requests.cancel(owner, request(`request-new`))
  assert.equal(signals[4]!.aborted, true)
  pending.resolve()
  await Promise.all(jobs)
})

test(`navigation and window loss cancel outstanding work and release ownership`, async () => {
  for (const reason of [`destroyed`, `render-process-gone`, `did-start-navigation`]) {
    const requests = new PlayerSearchRequests()
    const owner = event()
    const pending = Promise.withResolvers<void>()
    let signal: AbortSignal | undefined
    const job = requests.run(owner, request(`request-one`), async current => {
      signal = current
      await pending.promise
    })
    owner.sender.emit(reason, { isMainFrame: true, isSameDocument: false })
    assert.equal(signal?.aborted, true)
    pending.resolve()
    await job
  }
})

test(`legacy calls work and malformed identities are rejected before fetching`, async () => {
  const requests = new PlayerSearchRequests()
  let calls = 0
  await requests.run(event(), undefined, async signal => { assert.equal(signal, undefined); calls++ })
  await assert.rejects(requests.run(event(), { scopeId: `bad` }, async () => { calls++ }), /identity/u)
  assert.equal(calls, 1)
})
