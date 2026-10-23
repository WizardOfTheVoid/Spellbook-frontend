import assert from 'node:assert/strict'
import test from 'node:test'
import type { IpcMain } from 'electron'
import type { HttpClient } from '../api/http-client'
import { ServerIpcHandlers } from './server-ipc-handlers'

test(`Discord configuration IPC validates patches and forwards only selected team settings`, async () => {
  const handlers = new Map<string, (_event: unknown, value: unknown) => Promise<unknown>>()
  const calls: unknown[] = []
  const result = { ok: false, status: 409 }
  const send = async (path: string, body?: unknown) => { calls.push({ path, body }); return result }
  new ServerIpcHandlers({ handle: (key: string, callback: never) => handlers.set(key, callback) } as unknown as IpcMain,
    { getServer: send, patchServer: send } as unknown as HttpClient).register()
  const input = { guildId: `123456789012345678`, connectionId: 17, revision: 2, roleId: null }
  assert.equal(await handlers.get(`server:teams:discord:configuration:save`)!({}, { teamId: 7, input: { ...input, userId: 999 } }), result)
  await handlers.get(`server:teams:discord:configuration`)!({}, { teamId: 7 })
  await handlers.get(`server:teams:discord:resources`)!({}, { teamId: 7 })
  await assert.rejects(() => handlers.get(`server:teams:discord:configuration:save`)!({}, { teamId: 7, input: { ...input, roleId: 42 } }))
  assert.deepEqual(calls, [
    { path: `/teams/7/discord/configuration`, body: input },
    { path: `/teams/7/discord/configuration`, body: undefined }, { path: `/teams/7/discord/resources`, body: undefined }
  ])
})
