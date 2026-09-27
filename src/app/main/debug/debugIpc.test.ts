import assert from 'node:assert/strict'
import test from 'node:test'
import { DebugIpc } from './debugIpc'

test(`Debug controls reject an untrusted sender and invalid arguments before execution`, async () => {
  const handlers = new Map<string, (event: unknown, ...args: unknown[]) => Promise<unknown>>()
  const runs: number[] = []
  const actions = { getState: async () => ({ enabled: true }), run: async (slot: number) => { runs.push(slot) } }
  new DebugIpc({ handle: (name: string, handler: any) => { handlers.set(name, handler) } } as any,
    actions as any, (event: any, write) => event === `app` || (!write && event === `hud`)).register()
  const invoke = (event: string, method: string, ...args: unknown[]) => handlers.get(`debug:control`)!(event, method, args)
  await assert.rejects(invoke(`hud`, `run`, 2), /sender/u)
  await assert.rejects(invoke(`app`, `run`, `2`), /slot/u)
  await assert.rejects(invoke(`app`, `run`, 10), /slot/u)
  await assert.rejects(invoke(`app`, `constructor`), /operation/u)
  await invoke(`app`, `run`, 2)
  await invoke(`app`, `run`, 3)
  await invoke(`app`, `run`, 4)
  await assert.rejects(invoke(`app`, `run`, 5), /slot/u)
  assert.deepEqual(runs, [2, 3, 4])
  assert.deepEqual(await handlers.get(`debug:get-state`)!(`hud`), { enabled: true })
})

test(`Debug IPC forwards only explicit queue operations and numeric timing maps`, async () => {
  const handlers = new Map<string, (event: unknown, ...args: unknown[]) => Promise<unknown>>()
  const forwarded: unknown[] = []
  const actions = { queue: async (...args: unknown[]) => { forwarded.push(args) }, settings: async (...args: unknown[]) => { forwarded.push(args) } }
  new DebugIpc({ handle: (name: string, handler: any) => { handlers.set(name, handler) } } as any, actions as any, () => true).register()
  const invoke = (method: string, ...args: unknown[]) => handlers.get(`debug:control`)!({}, method, args)
  await assert.rejects(invoke(`queue`, `replay`), /operation/u)
  await assert.rejects(invoke(`settings`, { QUEUE_GATE_NORMAL: `400` }), /settings/u)
  await invoke(`queue`, `cancel`, `debug-one`)
  await invoke(`settings`, { QUEUE_GATE_NORMAL: 400 }, false, false)
  assert.deepEqual(forwarded, [[`cancel`, `debug-one`], [{ QUEUE_GATE_NORMAL: 400 }, false, false]])
})
