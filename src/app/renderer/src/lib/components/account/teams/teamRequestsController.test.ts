import assert from 'node:assert/strict'
import test from 'node:test'
import type { TeamJoinRequest } from '../../../core'
import type { TeamOutgoingInvitation } from '@spellbook/shared/notifications'
import type { TeamRequestsDependencies, TeamRequestsController } from './teamRequestsController'

const invitation = { id: 7, teamId: 3, userId: 2, displayName: `Recipient`, username: `recipient`, playfabId: `P2`, createdAt: `2026-10-29T00:00:00Z`, status: `pending` } as TeamOutgoingInvitation
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(finish => { resolve = finish })
  return { promise, resolve }
}
async function create(overrides: Partial<TeamRequestsDependencies> = {}) {
  const module = await import(`./teamRequestsController`).catch(() => ({}))
  const Controller = Reflect.get(module, `TeamRequestsController`)
  assert.equal(typeof Controller, `function`)
  let tick = () => {}
  let stopped = 0
  const controller = new Controller({
    requests: async () => [], invitations: async () => [], decide: async () => {},
    cancel: async () => ({ invitationId: 7, status: `cancelled` }), onChanged: async () => {},
    scheduler: { setInterval: (run: () => void, milliseconds: number) => { assert.equal(milliseconds, 8000)
      tick = run
      return 1 }, clearInterval: () => { stopped++ } },
    ...overrides
  }) as TeamRequestsController
  controller.setContext(1, 3, true)
  return { controller, tick: () => tick(), stopped: () => stopped }
}

test(`empty request views remain hydrated and visible while a background poll is pending`, async () => {
  const waiting = deferred<TeamJoinRequest[]>()
  let calls = 0
  const { controller, tick } = await create({ requests: async () => ++calls === 1 ? [] : waiting.promise })
  await controller.refresh()
  assert.equal(controller.state.hydrated, true)
  tick()
  assert.equal(controller.state.initialLoading, false)
  assert.equal(controller.state.refreshing, true)
  const duplicate = controller.refresh()
  assert.equal(calls, 2)
  waiting.resolve([])
  await duplicate
  assert.equal(controller.state.hydrated, true)
  assert.equal(controller.state.refreshing, false)
  controller.destroy()
})

test(`a failed background read preserves the complete request snapshot and only incoming requests affect counts`, async () => {
  let fail = false
  const counts: number[] = []
  const request = { userId: 9 } as TeamJoinRequest
  const { controller } = await create({ requests: async () => [request], invitations: async () => { if (fail) throw new Error(`Unavailable`)
    return [invitation] }, onIncomingCount: (_team, count) => { counts.push(count) } })
  await controller.refresh()
  fail = true
  await controller.refresh()
  assert.deepEqual(controller.state.incoming, [request])
  assert.deepEqual(controller.state.outgoing, [invitation])
  assert.equal(controller.state.error, `Unavailable`)
  assert.deepEqual(counts, [1])
  controller.destroy()
})

test(`team/account switches discard old polls and inactive or disposed views stop polling`, async () => {
  const waiting = deferred<TeamJoinRequest[]>()
  const { controller, stopped } = await create({ requests: async teamId => teamId === 3 ? waiting.promise : [] })
  const old = controller.refresh()
  controller.setContext(2, 4, true)
  const fresh = controller.refresh()
  waiting.resolve([{ userId: 9 }] as TeamJoinRequest[])
  await Promise.all([old, fresh])
  assert.deepEqual(controller.state.incoming, [])
  controller.setContext(2, 4, false)
  assert.ok(stopped() >= 2)
  controller.destroy()
  await controller.refresh()
  assert.deepEqual(controller.state.incoming, [])
})

test(`a poll started before cancellation cannot resurrect the outgoing invitation`, async () => {
  const waiting = deferred<TeamOutgoingInvitation[]>()
  let calls = 0
  let invitations = [invitation]
  const { controller } = await create({ invitations: async () => ++calls === 2 ? waiting.promise : invitations,
    cancel: async () => { invitations = []
      return { invitationId: 7, status: `cancelled` } } })
  await controller.refresh()
  const old = controller.refresh()
  const cancellation = controller.cancel(7)
  await Promise.resolve()
  waiting.resolve([invitation])
  await Promise.all([old, cancellation])
  assert.deepEqual(controller.state.outgoing, [])
  assert.equal(controller.state.notice, `Invitation cancelled.`)
  controller.destroy()
})

test(`cancellation reconciles accepted invitations and failed actions remain retryable`, async () => {
  let fail = true
  let changed = 0
  let pending = true
  const { controller } = await create({ invitations: async () => pending ? [invitation] : [], onChanged: async () => { changed++ },
    cancel: async () => { if (fail) throw new Error(`Try again`)
      pending = false
      return { invitationId: 7, status: `accepted` } } })
  await controller.refresh()
  await controller.cancel(7)
  assert.deepEqual(controller.state.outgoing, [invitation])
  assert.equal(controller.state.mutationError, `Try again`)
  fail = false
  await controller.cancel(7)
  assert.deepEqual(controller.state.outgoing, [])
  assert.equal(controller.state.notice, `This invitation was already accepted.`)
  assert.equal(changed, 1)
  controller.destroy()
})

test(`hiding the view during a mutation releases row state and polling resumes`, async () => {
  const pending = deferred<{ invitationId: number, status: `cancelled` }>()
  let invitations = [invitation]
  const { controller } = await create({ invitations: async () => invitations,
    cancel: async () => { const result = await pending.promise
      invitations = []
      return result } })
  await controller.refresh()
  const cancelling = controller.cancel(7)
  controller.setContext(1, 3, false)
  pending.resolve({ invitationId: 7, status: `cancelled` })
  await cancelling
  assert.deepEqual(controller.state.busyKeys, [])
  controller.setContext(1, 3, true)
  await controller.refresh()
  assert.deepEqual(controller.state.outgoing, [])
  controller.destroy()
})
