import assert from 'node:assert/strict'
import test from 'node:test'
import { createEvidenceBridge } from './evidenceBridge'

test(`comments preserve the selected video position, including zero and untimed screenshots`, async () => {
  const calls: unknown[] = []
  const bridge = createEvidenceBridge({
    invoke: async (channel, ...args) => { calls.push({ channel, args }); return { ok: true } },
    on: () => undefined,
    removeListener: () => undefined
  })
  await bridge.comment(42, `First frame`, 0)
  await bridge.comment(42, `At the jump`, 31250)
  await bridge.comment(43, `Screenshot`)
  assert.deepEqual(calls, [
    { channel: `server:evidence:comment`, args: [{ evidenceId: 42, body: `First frame`, positionMs: 0 }] },
    { channel: `server:evidence:comment`, args: [{ evidenceId: 42, body: `At the jump`, positionMs: 31250 }] },
    { channel: `server:evidence:comment`, args: [{ evidenceId: 43, body: `Screenshot`, positionMs: null }] }
  ])
})

test(`evidence linking and counted playback send explicit selections`, async () => {
  const calls: unknown[] = []
  const bridge = createEvidenceBridge({
    invoke: async (channel, ...args) => {
      calls.push({ channel, args })
      return { ok: true }
    },
    on: () => undefined,
    removeListener: () => undefined
  })
  await bridge.offenses(42, [7, 8])
  await bridge.view(42, `b168d9ef-e253-4a3c-bfc8-0b82ef7bd730`, 2000)
  assert.deepEqual(calls, [
    { channel: `server:evidence:offenses`, args: [{ evidenceId: 42, offenseIds: [7, 8] }] },
    { channel: `server:evidence:view`, args: [{ evidenceId: 42, sessionId: `b168d9ef-e253-4a3c-bfc8-0b82ef7bd730`, watchedMs: 2000 }] }
  ])
})

test(`evidence and comment deletion send only their selected IDs`, async () => {
  const calls: unknown[] = []
  const bridge = createEvidenceBridge({
    invoke: async (channel, ...args) => { calls.push({ channel, args }); return { ok: true } },
    on: () => undefined,
    removeListener: () => undefined
  })
  await bridge.delete(42)
  await bridge.deleteComment(42, 7)
  assert.deepEqual(calls, [
    { channel: `server:evidence:delete`, args: [{ evidenceId: 42 }] },
    { channel: `server:evidence:delete-comment`, args: [{ evidenceId: 42, commentId: 7 }] }
  ])
})

test(`progress is delivered without the IPC event and unsubscribes, while release sends only selection IDs`, async () => {
  const updates: unknown[] = []
  const calls: unknown[] = []
  const listeners = new Map<string, (event: unknown, progress: never) => void>()
  const bridge = createEvidenceBridge({
    invoke: async (channel, ...args) => { calls.push({ channel, args }) },
    on: (channel, listener) => listeners.set(channel, listener),
    removeListener: (channel) => listeners.delete(channel)
  })
  const unsubscribe = bridge.onProgress(progress => updates.push(progress))
  listeners.get(`server:evidence:progress`)!({ secret: true }, { fileId: `selected`, phase: `converting`, completed: 50, total: 100 } as never)
  unsubscribe()
  await bridge.release([`selected`])
  assert.deepEqual(updates, [{ fileId: `selected`, phase: `converting`, completed: 50, total: 100 }])
  assert.equal(listeners.size, 0)
  assert.deepEqual(calls, [{ channel: `server:evidence:release`, args: [[`selected`]] }])
})
