import assert from 'node:assert/strict'
import test from 'node:test'
import { ForensicsIpc } from './forensicsIpc'

test(`forensics IPC forwards only exact read paths and valid IDs from the main frame`, async () => {
  const handlers = new Map<string, (...args: any[]) => Promise<unknown>>()
  const calls: string[] = []
  const frame = {}
  const sender = { mainFrame: frame }
  const event = { sender, senderFrame: frame }
  const result = { ok: false, status: 403, data: { ok: false, error: { code: `FORBIDDEN` } } }
  new ForensicsIpc({ handle: (name: string, handler: any) => handlers.set(name, handler) } as never,
    { getServer: async (path: string) => { calls.push(path); return result } } as never,
    { getCurrent: () => ({ webContents: sender }) } as never).register()
  assert.equal(await handlers.get(`server:forensics:alt:vectors`)!(event), result)
  assert.equal(await handlers.get(`server:forensics:alt:ping`)!(event, 7), result)
  assert.equal(await handlers.get(`server:forensics:alt:triangulate`)!(event, 7), result)
  assert.deepEqual(calls, [`/forensics/alt/vectors`, `/forensics/alt/players/7/vectors/ping`, `/forensics/alt/players/7/vectors/triangulate`])
  for (const operation of [`ping`, `triangulate`]) for (const id of [0, -1, 1.5, `7`, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, { isSuperadmin: true }]) {
    await assert.rejects(() => handlers.get(`server:forensics:alt:${operation}`)!(event, id))
  }
  for (const operation of [`vectors`, `ping`, `triangulate`]) for (const invalid of [{ sender: {}, senderFrame: frame }, { sender, senderFrame: {} }, { sender }]) {
    await assert.rejects(() => handlers.get(`server:forensics:alt:${operation}`)!(invalid, 7))
  }
  assert.equal(calls.length, 3)
})
