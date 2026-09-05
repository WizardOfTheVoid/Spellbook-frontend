import assert from 'node:assert/strict'
import test from 'node:test'
import type { IpcMain } from 'electron'
import type { HttpClient } from '../api/http-client'
import type { CoreCallResult } from '../types'
import { DiscordInstallIpcHandlers } from './discord-install-ipc-handlers'

type Handler = (_event: unknown, payload: unknown) => Promise<unknown>

test('opens only the Server-issued Discord authorization URL', async () => {
  const fixture = createFixture('https://discord.com/oauth2/authorize?client_id=1')

  await fixture.handlers.get('discord:install')?.({}, { teamId: 7 })

  assert.deepEqual(fixture.calls, [{ path: '/teams/7/discord-install', body: {} }])
  assert.deepEqual(fixture.opened, ['https://discord.com/oauth2/authorize?client_id=1'])
})

test('accepts Discord www authorization URLs', async () => {
  const fixture = createFixture('https://www.discord.com/oauth2/authorize?client_id=1')

  await fixture.handlers.get('discord:install')?.({}, { teamId: 7 })

  assert.equal(fixture.opened.length, 1)
})

test('rejects unsafe external URLs before opening them', async () => {
  for (const url of [
    'http://discord.com/oauth2/authorize?client_id=1',
    'https://discord.example.com/oauth2/authorize?client_id=1',
    'https://user@discord.com/oauth2/authorize?client_id=1',
    'https://discord.com/channels/@me'
  ]) {
    const fixture = createFixture(url)
    await assert.rejects(
      () => fixture.handlers.get('discord:install')?.({}, { teamId: 7 }) as Promise<unknown>,
      /Discord install URL/u
    )
    assert.deepEqual(fixture.opened, [])
  }
})

test('rejects invalid team IDs and unsuccessful envelopes before opening', async () => {
  const fixture = createFixture('https://discord.com/oauth2/authorize', false)

  await assert.rejects(
    () => fixture.handlers.get('discord:install')?.({}, { teamId: 0 }) as Promise<unknown>,
    /teamId/u
  )
  await assert.rejects(
    () => fixture.handlers.get('discord:install')?.({}, { teamId: 7 }) as Promise<unknown>,
    /Discord install URL/u
  )
  assert.deepEqual(fixture.calls, [{ path: '/teams/7/discord-install', body: {} }])
  assert.deepEqual(fixture.opened, [])
})

function createFixture(url: string, ok = true) {
  const handlers = new Map<string, Handler>()
  const calls: unknown[] = []
  const opened: string[] = []
  const result: CoreCallResult = {
    ok,
    status: ok ? 200 : 403,
    statusText: ok ? 'OK' : 'Forbidden',
    data: ok ? { ok: true, data: { url } } : { ok: false, data: null }
  }
  const ipcMain = {
    handle: (channel: string, handler: Handler) => handlers.set(channel, handler)
  } as unknown as IpcMain
  const httpClient = {
    postServer: async (path: string, body: unknown) => {
      calls.push({ path, body })
      return result
    }
  } as unknown as HttpClient
  new DiscordInstallIpcHandlers(ipcMain, httpClient, async value => { opened.push(value) }).register()
  return { handlers, calls, opened }
}
