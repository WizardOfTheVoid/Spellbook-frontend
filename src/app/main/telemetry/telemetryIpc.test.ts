import assert from 'node:assert/strict'
import { test } from 'node:test'
import { TelemetryIpc } from './telemetryIpc'
import type { TelemetryUpdate } from '../../shared/telemetry/telemetryTypes'
import { EventEmitter } from 'node:events'

test(`slow renderer receives one outstanding update and the latest resync after acknowledgement`, () => {
  const handlers = new Map<string, Function>()
  const sent: { update: TelemetryUpdate }[] = []
  const frame = {}
  const sender = {
    mainFrame: frame,
    isDestroyed: () => false,
    send: (_name: string, payload: { update: TelemetryUpdate }) => sent.push(payload),
    once: () => {},
    off: () => {}
  }
  const event = { sender, senderFrame: frame }
  let receive: (u: TelemetryUpdate) => void = () => {}
  const telemetry = {
    subscribe: (_input: unknown, changed: typeof receive) => {
      receive = changed
      return () => {}
    },
    call: async () => null
  }
  const boundary = new TelemetryIpc(
    { handle: (key: string, fn: Function) => handlers.set(key, fn) } as never,
    telemetry as never,
    { getCurrent: () => ({ webContents: sender }) } as never,
    () => true
  )
  boundary.register()
  const id = `34b61043-c474-48fa-97af-62408c7ed02e`
  handlers.get(`telemetry:subscribe`)!(event, { subscriptionId: id, recordingId: id })
  const update: TelemetryUpdate = {
    protocolVersion: 1,
    recordingId: id,
    revision: 1,
    cursor: { generation: id, updateSequence: 1 },
    committedHead: { sequence: 0, elapsedUs: 1000 },
    kind: `changed`,
    state: `recording`
  }
  for (let i = 1; i <= 100; i++)
    receive({ ...update, revision: i, cursor: { generation: id, updateSequence: i } })
  assert.equal(sent.length, 1)
  handlers.get(`telemetry:ack`)!(event, id)
  assert.equal(sent.length, 2)
  assert.equal(sent[1].update.revision, 100)
  assert.equal(sent[1].update.kind, `resync`)
  assert.throws(() =>
    handlers.get(`telemetry:subscribe`)!(
      { ...event, senderFrame: {} },
      { subscriptionId: id, recordingId: id }
    )
  )
})

test(`duplicate subscriptions cannot replace an owner and cleanup removes window listeners`, () => {
  const handlers = new Map<string, Function>()
  const sender = Object.assign(new EventEmitter(), {
    mainFrame: {},
    isDestroyed: () => false,
    send: () => {}
  })
  const event = { sender, senderFrame: sender.mainFrame }
  let subscriptions = 0
  let stopped = 0
  let cancelledReads = 0
  const telemetry = {
    cancelAllReads: () => { cancelledReads++ },
    subscribe: () => {
      subscriptions++
      return () => {
        stopped++
      }
    }
  }
  const boundary = new TelemetryIpc(
    { handle: (key: string, fn: Function) => handlers.set(key, fn) } as never,
    telemetry as never,
    { getCurrent: () => ({ webContents: sender }) } as never,
    () => true
  )
  boundary.register()
  const id = `34b61043-c474-48fa-97af-62408c7ed02e`
  handlers.get(`telemetry:subscribe`)!(event, { subscriptionId: id, recordingId: id })
  assert.throws(() =>
    handlers.get(`telemetry:subscribe`)!(event, { subscriptionId: id, recordingId: id })
  )
  assert.equal(subscriptions, 1)
  handlers.get(`telemetry:unsubscribe`)!(event, id)
  assert.equal(stopped, 1)
  assert.equal(sender.listenerCount(`destroyed`), 0)
  boundary.clear()
  assert.equal(stopped, 1)
  assert.equal(cancelledReads, 1)
})

test(`replacing the authorized window cancels previous reads without letting its late destruction cancel the new owner`, async () => {
  const handlers = new Map<string, Function>()
  const window = () => Object.assign(new EventEmitter(), { mainFrame: {} })
  const first = window()
  const second = window()
  let current = first
  let cancellations = 0
  let stopped = 0
  const boundary = new TelemetryIpc(
    { handle: (key: string, fn: Function) => handlers.set(key, fn) } as never,
    {
      call: async () => null,
      cancelAllReads: () => { cancellations++ },
      subscribe: () => () => { stopped++ }
    } as never,
    { getCurrent: () => ({ webContents: current }) } as never,
    () => true
  )
  boundary.register()
  await handlers.get(`telemetry:call`)!({ sender: first, senderFrame: first.mainFrame }, `getStatus`)
  const id = `34b61043-c474-48fa-97af-62408c7ed02e`
  handlers.get(`telemetry:subscribe`)!({ sender: first, senderFrame: first.mainFrame }, { subscriptionId: id, recordingId: id })
  current = second
  await handlers.get(`telemetry:call`)!({ sender: second, senderFrame: second.mainFrame }, `getStatus`)
  assert.equal(cancellations, 2)
  assert.equal(stopped, 1)
  first.emit(`destroyed`)
  assert.equal(cancellations, 2)
  second.emit(`destroyed`)
  assert.equal(cancellations, 3)
})

test(`full renderer navigation clears read watermarks and subscriptions while same-document and subframe navigation preserve them`, async () => {
  const handlers = new Map<string, Function>()
  const sender = Object.assign(new EventEmitter(), { mainFrame: {} })
  let cancellations = 0
  let stopped = 0
  const boundary = new TelemetryIpc(
    { handle: (key: string, fn: Function) => handlers.set(key, fn) } as never,
    {
      call: async () => null,
      cancelAllReads: () => { cancellations++ },
      subscribe: () => () => { stopped++ }
    } as never,
    { getCurrent: () => ({ webContents: sender }) } as never,
    () => true
  )
  boundary.register()
  const event = { sender, senderFrame: sender.mainFrame }
  await handlers.get(`telemetry:call`)!(event, `getStatus`)
  const id = `34b61043-c474-48fa-97af-62408c7ed02e`
  handlers.get(`telemetry:subscribe`)!(event, { subscriptionId: id, recordingId: id })
  sender.emit(`did-start-navigation`, { isMainFrame: true, isSameDocument: true })
  sender.emit(`did-start-navigation`, { isMainFrame: false, isSameDocument: false })
  assert.equal(cancellations, 1)
  assert.equal(stopped, 0)
  sender.emit(`did-start-navigation`, { isMainFrame: true, isSameDocument: false })
  assert.equal(cancellations, 2)
  assert.equal(stopped, 1)
})
