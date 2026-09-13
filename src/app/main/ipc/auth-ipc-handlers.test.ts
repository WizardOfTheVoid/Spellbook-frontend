import assert from 'node:assert/strict'
import test from 'node:test'
import { setImmediate } from 'node:timers/promises'
import type { IpcMain } from 'electron'
import type { HttpClient } from '../api/http-client'
import type { AuthSessionStore } from '../services/auth-session-store'
import type { MainAuthState } from '../services/mainRuntimeCoordinator'
import type { CoreCallResult } from '../types'
import type { OverlayWindowController } from '../window/overlay-window-controller'
import { AuthIpcHandlers } from './auth-ipc-handlers'

type Handler = (...args: unknown[]) => unknown

const user = (onboardingComplete: boolean) => ({
  id: 31,
  username: `admin`,
  isActive: true,
  onboardingComplete
})

const result = (data: unknown): CoreCallResult => ({
  ok: true,
  status: 200,
  statusText: `OK`,
  data: { ok: true, data }
})

test(`pending sessions stay locked and poll every 30 seconds until approved`, async context => {
  context.mock.timers.enable({ apis: [`setInterval`] })
  let calls = 0
  let approved = false
  const sent: unknown[] = []
  const fixture = createFixture({
    token: `pending-token`,
    getServer: async () => { calls += 1; return result({ ...user(true), isActive: approved }) },
    onSendCurrent: (_channel, value) => sent.push(value)
  })
  await fixture.auth.restoreSession()
  assert.equal(fixture.persistedToken, `pending-token`)
  assert.equal(fixture.auth.getState().authenticated, false)
  context.mock.timers.tick(29_999)
  await setImmediate()
  assert.equal(calls, 1)
  context.mock.timers.tick(1)
  await setImmediate()
  assert.equal(calls, 2)
  approved = true
  context.mock.timers.tick(30_000)
  await setImmediate()
  assert.equal(calls, 3)
  assert.equal(fixture.auth.getState().authenticated, true)
  assert.deepEqual(sent.at(-1), result(user(true)))
  assert.equal(fixture.persistedToken, `pending-token`)
  context.mock.timers.tick(60_000)
  await setImmediate()
  assert.equal(calls, 3)
})

test(`approval polling survives temporary failures and ejects a suspended account`, async context => {
  context.mock.timers.enable({ apis: [`setInterval`] })
  let calls = 0
  const suspended: CoreCallResult = {
    ok: false, status: 401, statusText: `Unauthorized`,
    data: { ok: false, error: { code: `ACCOUNT_SUSPENDED`, message: `Suspended` } }
  }
  const sent: unknown[] = []
  const fixture = createFixture({
    token: `pending-token`,
    getServer: async () => {
      calls += 1
      if (calls === 1) return result({ ...user(true), isActive: false })
      if (calls === 2) throw new Error(`Offline`)
      if (calls === 3) return { ok: false, status: 503, statusText: `Unavailable`, data: null }
      return suspended
    },
    onSendCurrent: (_channel, value) => sent.push(value)
  })
  await fixture.auth.restoreSession()
  for (let tick = 0; tick < 2; tick += 1) {
    context.mock.timers.tick(30_000)
    await setImmediate()
    assert.equal(fixture.persistedToken, `pending-token`)
    assert.equal(sent.length, 0)
  }
  context.mock.timers.tick(30_000)
  await setImmediate()
  assert.equal(fixture.persistedToken, ``)
  assert.deepEqual(sent, [suspended])
  context.mock.timers.tick(30_000)
  await setImmediate()
  assert.equal(calls, 4)
})

test(`logout stops approval polling and discards an in-flight approval`, async context => {
  context.mock.timers.enable({ apis: [`setInterval`] })
  const pending = deferred<CoreCallResult>()
  let calls = 0
  const sent: unknown[] = []
  const fixture = createFixture({
    token: `pending-token`,
    getServer: async () => ++calls === 1 ? result({ ...user(true), isActive: false }) : pending.promise,
    onSendCurrent: (_channel, value) => sent.push(value)
  })
  fixture.auth.register()
  await fixture.auth.restoreSession()
  context.mock.timers.tick(30_000)
  await setImmediate()
  context.mock.timers.tick(30_000)
  await setImmediate()
  assert.equal(calls, 2)
  const loggingOut = fixture.handlers.get(`auth:logout`)?.({})
  pending.resolve(result(user(true)))
  await loggingOut
  context.mock.timers.tick(30_000)
  await setImmediate()
  assert.equal(calls, 2)
  assert.equal(fixture.persistedToken, ``)
  assert.equal(fixture.auth.getState().authenticated, false)
  assert.deepEqual(sent, [])
})

test('startup validates a stored token before publishing eligible Main auth state', async () => {
  const events: string[] = []
  const fixture = createFixture({
    token: `stored-token`,
    getServer: async path => {
      events.push(`get:${path}`)
      return result(user(true))
    },
    onToken: token => events.push(`token:${token}`)
  })
  fixture.auth.subscribe(async state => { events.push(`state:${state.authenticated}:${state.onboardingComplete}`) })

  await fixture.auth.restoreSession()

  assert.deepEqual(events, [
    `token:stored-token`,
    `get:/auth/session`,
    `state:true:true`
  ])
  assert.deepEqual(fixture.auth.getState(), { authenticated: true, onboardingComplete: true })
  assert.equal(Object.isFrozen(fixture.auth.getState()), true)
})

test('blank startup session publishes signed-out without a Server request', async () => {
  let serverCalls = 0
  const states: MainAuthState[] = []
  const fixture = createFixture({
    token: `   `,
    getServer: async () => {
      serverCalls += 1
      return result(user(true))
    }
  })
  fixture.auth.subscribe(async state => { states.push(state) })

  await fixture.auth.restoreSession()

  assert.equal(serverCalls, 0)
  assert.deepEqual(states, [{ authenticated: false, onboardingComplete: false }])
})

test(`Discord login hides the overlay after opening the browser and the callback reopens it`, async () => {
  const opened: string[] = []
  const fixture = createFixture({
    getServer: async path => path === `/auth/discord/start`
      ? result({ url: `https://discord.com/oauth2/authorize?state=test` })
      : result(user(false)),
    postServer: async () => result({ token: `new-token` }),
    onOpenExternal: async url => {
      assert.equal(fixture.overlayHides, 0)
      opened.push(url)
    }
  })
  fixture.auth.register()
  await fixture.handlers.get(`auth:login`)?.({})
  assert.deepEqual(opened, [`https://discord.com/oauth2/authorize?state=test`])
  assert.equal(fixture.overlayHides, 1)
  await fixture.auth.acceptProtocolUrl(`spellbook://auth?ticket=test`)
  assert.equal(fixture.overlayShows, 1)
  assert.equal(fixture.persistedToken, `new-token`)
})

test(`a failed browser launch leaves the login screen visible`, async () => {
  const fixture = createFixture({
    getServer: async () => result({ url: `https://discord.com/oauth2/authorize?state=test` }),
    onOpenExternal: async () => { throw new Error(`Browser could not open`) }
  })
  fixture.auth.register()
  await assert.rejects(
    async () => fixture.handlers.get(`auth:login`)?.({}),
    /Browser could not open/u
  )
  assert.equal(fixture.overlayHides, 0)
})

test('account help opens only the fixed support URL', async () => {
  const opened: string[] = []
  const fixture = createFixture({ onOpenExternal: async url => { opened.push(url) } })
  fixture.auth.register()

  await fixture.handlers.get(`auth:help`)?.({})

  assert.deepEqual(opened, [`https://chivalry2.dev/discord`])
})

test('startup hands a suspended-account denial to the renderer after clearing its token', async () => {
  let serverCalls = 0
  const suspended: CoreCallResult = {
    ok: false,
    status: 401,
    statusText: `Unauthorized`,
    data: {
      ok: false,
      error: { code: `ACCOUNT_SUSPENDED`, message: `Your account has been suspended.` }
    }
  }
  const fixture = createFixture({
    token: `stored-token`,
    getServer: async () => {
      serverCalls += 1
      return serverCalls === 1
        ? suspended
        : { ok: false, status: 401, statusText: `Unauthorized`, data: null }
    }
  })
  fixture.auth.register()

  await fixture.auth.restoreSession()
  const rendererResult = await fixture.handlers.get(`auth:session`)?.({})

  assert.deepEqual(rendererResult, suspended)
  assert.equal(serverCalls, 1)
  assert.equal(fixture.persistedToken, ``)
})

test('transient startup failure stops runtime but retains the stored token', async () => {
  const states: MainAuthState[] = []
  const fixture = createFixture({
    token: `stored-token`,
    getServer: async () => ({
      ok: false,
      status: 503,
      statusText: `SERVER_UNAVAILABLE`,
      data: null
    })
  })
  fixture.auth.subscribe(async state => { states.push(state) })

  await fixture.auth.restoreSession()

  assert.deepEqual(states, [{ authenticated: false, onboardingComplete: false }])
  assert.deepEqual(fixture.sessionEvents, [])
  assert.equal(fixture.tokens.at(-1), `stored-token`)
})

test('definite invalid startup waits for runtime shutdown before clearing the token', async () => {
  const events: string[] = []
  const shutdown = deferred<void>()
  const stopStarted = deferred<void>()
  const fixture = createFixture({
    token: `stored-token`,
    getServer: async () => ({ ok: false, status: 401, statusText: `Unauthorized`, data: null }),
    onToken: token => events.push(`token:${token}`),
    onClear: () => events.push(`disk:clear`)
  })
  fixture.auth.subscribe(async () => {
    events.push(`runtime:stop`)
    stopStarted.resolve()
    await shutdown.promise
    events.push(`runtime:stopped`)
  })

  const restoring = fixture.auth.restoreSession()
  await stopStarted.promise
  assert.deepEqual(events, [`token:stored-token`, `runtime:stop`])

  shutdown.resolve()
  await restoring
  assert.deepEqual(events, [
    `token:stored-token`,
    `runtime:stop`,
    `runtime:stopped`,
    `token:`,
    `disk:clear`
  ])
})

test('profile completion publishes onboarding before the IPC response resolves', async () => {
  const published = deferred<void>()
  const fixture = createFixture({ patchServer: async () => result(user(true)) })
  fixture.auth.subscribe(async state => {
    assert.deepEqual(state, { authenticated: true, onboardingComplete: true })
    await published.promise
  })
  fixture.auth.register()

  const profile = fixture.handlers.get(`auth:profile`)
  assert.ok(profile)
  let resolved = false
  const request = Promise.resolve(profile({}, { displayName: `Admin`, playfabId: `PLAYER` }))
    .then(value => {
      resolved = true
      return value
    })
  await Promise.resolve()
  assert.equal(resolved, false)

  published.resolve()
  assert.deepEqual(await request, result(user(true)))
  assert.equal(resolved, true)
})

test('explicit session 403 waits for runtime stop before clearing the token', async () => {
  const releaseStop = deferred<void>()
  const stopStarted = deferred<void>()
  const events: string[] = []
  const fixture = createFixture({
    getServer: async () => ({ ok: false, status: 403, statusText: `Forbidden`, data: null }),
    onToken: token => events.push(`token:${token}`),
    onClear: () => events.push(`disk:clear`)
  })
  fixture.auth.subscribe(async () => {
    events.push(`runtime:stop`)
    stopStarted.resolve()
    await releaseStop.promise
    events.push(`runtime:stopped`)
  })
  fixture.auth.register()

  const request = fixture.handlers.get(`auth:session`)?.({}) as Promise<CoreCallResult>
  await stopStarted.promise
  assert.deepEqual(events, [`runtime:stop`])

  releaseStop.resolve()
  const response = await request
  assert.equal(response.status, 403)
  assert.deepEqual(events, [
    `runtime:stop`,
    `runtime:stopped`,
    `token:`,
    `disk:clear`
  ])
})

test('logout stops runtime before the Server call and clears token in finally', async () => {
  const events: string[] = []
  const fixture = createFixture({
    token: `stored-token`,
    getServer: async () => result(user(true)),
    postServer: async path => {
      events.push(`post:${path}`)
      return { ok: false, status: 503, statusText: `offline`, data: null }
    },
    onToken: token => events.push(`token:${token}`),
    onClear: () => events.push(`disk:clear`)
  })
  fixture.auth.subscribe(async state => {
    events.push(state.authenticated ? `runtime:start` : `runtime:stop`)
  })
  await fixture.auth.restoreSession()
  events.length = 0
  fixture.auth.register()

  await fixture.handlers.get(`auth:logout`)?.({})

  assert.deepEqual(events, [
    `runtime:stop`,
    `post:/auth/logout`,
    `token:`,
    `disk:clear`
  ])
})

test('logout clears the session when the Server call throws', async () => {
  const fixture = createFixture({
    postServer: async () => { throw new Error(`logout transport failed`) }
  })
  fixture.auth.register()

  await assert.rejects(
    fixture.handlers.get(`auth:logout`)?.({}) as Promise<CoreCallResult>,
    /logout transport failed/u
  )

  assert.equal(fixture.tokens.at(-1), ``)
  assert.deepEqual(fixture.sessionEvents, [`clear`])
})

test('an old session response cannot restart after logout begins', async () => {
  const session = deferred<CoreCallResult>()
  const sessionStarted = deferred<void>()
  const states: MainAuthState[] = []
  const fixture = createFixture({
    getServer: async () => {
      sessionStarted.resolve()
      return session.promise
    },
    postServer: async () => result(null)
  })
  fixture.auth.subscribe(async state => { states.push(state) })
  fixture.auth.register()

  const oldSession = fixture.handlers.get(`auth:session`)?.({}) as Promise<CoreCallResult>
  await sessionStarted.promise
  const logout = fixture.handlers.get(`auth:logout`)?.({}) as Promise<CoreCallResult>
  session.resolve(result(user(true)))
  const oldResult = await oldSession
  await logout

  assert.equal(oldResult.status, 409)
  assert.deepEqual(states, [{ authenticated: false, onboardingComplete: false }])
  assert.deepEqual(fixture.auth.getState(), { authenticated: false, onboardingComplete: false })
})

test('an ordinary session waits behind protocol login without cancelling it', async () => {
  const ticket = deferred<CoreCallResult>()
  const ticketStarted = deferred<void>()
  const events: string[] = []
  let sessionCalls = 0
  const fixture = createFixture({
    postServer: async path => {
      if (path === `/auth/ticket`) {
        events.push(`ticket:start`)
        ticketStarted.resolve()
        return ticket.promise
      }
      return result(null)
    },
    getServer: async path => {
      sessionCalls += 1
      events.push(`get:${path}:${sessionCalls}`)
      return result(user(true))
    },
    onSave: () => events.push(`disk:save`),
    onToken: token => events.push(`token:${token}`)
  })
  fixture.auth.register()

  const protocol = fixture.auth.acceptProtocolUrl(`spellbook://auth?ticket=new-ticket`)
  await ticketStarted.promise
  const ordinary = fixture.handlers.get(`auth:session`)?.({}) as Promise<CoreCallResult>
  await Promise.resolve()
  assert.equal(sessionCalls, 0)

  ticket.resolve(result({ token: `new-token` }))
  await protocol
  const ordinaryResult = await ordinary

  assert.equal(ordinaryResult.ok, true)
  assert.deepEqual(events.slice(0, 5), [
    `ticket:start`,
    `disk:save`,
    `token:new-token`,
    `get:/auth/session:1`,
    `get:/auth/session:2`
  ])
})

test('protocol identity intent advances the Server auth epoch before ticket exchange resolves', async () => {
  const ticket = deferred<CoreCallResult>()
  const ticketStarted = deferred<void>()
  const events: string[] = []
  const fixture = createFixture({
    postServer: async () => {
      events.push(`ticket:start`)
      ticketStarted.resolve()
      return ticket.promise
    },
    onAuthEpoch: () => events.push(`epoch`)
  })

  const protocol = fixture.auth.acceptProtocolUrl(`spellbook://auth?ticket=new-ticket`)
  await ticketStarted.promise
  assert.deepEqual(events, [`epoch`, `ticket:start`])

  ticket.resolve({ ok: false, status: 401, statusText: `Unauthorized`, data: null })
  await protocol
})

test('protocol identity intent starts runtime cancellation before ticket exchange', async () => {
  const releaseStop = deferred<void>()
  const stopStarted = deferred<void>()
  let ticketStarted = false
  const fixture = createFixture({
    postServer: async () => {
      ticketStarted = true
      return { ok: false, status: 401, statusText: `Unauthorized`, data: null }
    }
  })
  fixture.auth.subscribe(async state => {
    if (state.authenticated) return
    stopStarted.resolve()
    await releaseStop.promise
  })

  const protocol = fixture.auth.acceptProtocolUrl(`spellbook://auth?ticket=new-ticket`)
  await stopStarted.promise
  assert.equal(ticketStarted, false)

  releaseStop.resolve()
  await protocol
  assert.equal(ticketStarted, true)
})

test('valid protocol URL remains handled when a newer identity supersedes its operation', async () => {
  const fixture = createFixture()
  fixture.auth.register()

  const protocol = fixture.auth.acceptProtocolUrl(`spellbook://auth?ticket=older`)
  const logout = fixture.handlers.get(`auth:logout`)?.({}) as Promise<CoreCallResult>

  assert.equal(await protocol, true)
  await logout
})

test('a superseded protocol save cannot remain restorable when the newer login fails', async () => {
  const saveStarted = deferred<void>()
  const releaseSave = deferred<void>()
  let ticketCalls = 0
  let sessionCalls = 0
  const fixture = createFixture({
    postServer: async path => {
      assert.equal(path, `/auth/ticket`)
      ticketCalls += 1
      return ticketCalls === 1
        ? result({ token: `older-token` })
        : { ok: false, status: 401, statusText: `Unauthorized`, data: null }
    },
    getServer: async () => {
      sessionCalls += 1
      return result(user(true))
    },
    saveSession: async (_token, persist) => {
      persist()
      saveStarted.resolve()
      await releaseSave.promise
    }
  })

  const older = fixture.auth.acceptProtocolUrl(`spellbook://auth?ticket=older`)
  await saveStarted.promise
  const newer = fixture.auth.acceptProtocolUrl(`spellbook://auth?ticket=newer`)
  releaseSave.resolve()

  assert.equal(await older, true)
  assert.equal(await newer, true)
  assert.equal(fixture.persistedToken, ``)

  await fixture.auth.restoreSession()

  assert.equal(sessionCalls, 0)
  assert.equal(fixture.tokens.at(-1), ``)
})

test('ambiguous stale persistence is reconciled before a newer protocol token is saved', async () => {
  const saveStarted = deferred<void>()
  const releaseSave = deferred<void>()
  const persistenceEvents: string[] = []
  let ticketCalls = 0
  const fixture = createFixture({
    postServer: async () => {
      ticketCalls += 1
      return result({ token: ticketCalls === 1 ? `older-token` : `newer-token` })
    },
    getServer: async () => result(user(true)),
    saveSession: async (token, persist) => {
      persistenceEvents.push(`save:${token}`)
      persist()
      if (token !== `older-token`) return

      saveStarted.resolve()
      await releaseSave.promise
      throw new Error(`ambiguous persistence failure`)
    },
    onClear: () => persistenceEvents.push(`clear`)
  })

  const older = fixture.auth.acceptProtocolUrl(`spellbook://auth?ticket=older`)
    .catch(error => error)
  await saveStarted.promise
  const newer = fixture.auth.acceptProtocolUrl(`spellbook://auth?ticket=newer`)
  releaseSave.resolve()

  assert.equal(await older, true)
  assert.equal(await newer, true)
  assert.deepEqual(persistenceEvents, [
    `save:older-token`,
    `clear`,
    `save:newer-token`
  ])
  assert.equal(fixture.persistedToken, `newer-token`)
})

test('malformed and former protocol URLs safely fall back without starting an identity intent', async () => {
  let epochs = 0
  const fixture = createFixture({ onAuthEpoch: () => { epochs += 1 } })

  assert.equal(await fixture.auth.acceptProtocolUrl(`not a URL`), false)
  assert.equal(await fixture.auth.acceptProtocolUrl(`chiv-admin-tool://auth?ticket=legacy`), false)
  assert.equal(epochs, 0)
})

test('Discord install protocol completion emits status without changing authentication', async () => {
  const events: unknown[] = []
  let epochs = 0
  let posts = 0
  const fixture = createFixture({
    onAuthEpoch: () => { epochs += 1 },
    postServer: async () => { posts += 1; return result(null) },
    onCreatedSend: (channel, value) => events.push({ channel, value })
  })

  assert.equal(await fixture.auth.acceptProtocolUrl(
    `spellbook://discord-install?status=success&teamId=8&guildId=456&guildName=KRT%20Discord`
  ), true)
  assert.equal(await fixture.auth.acceptProtocolUrl(
    `spellbook://discord-install?status=error&teamId=8&message=Discord%20installation%20failed.`
  ), true)

  assert.deepEqual(events, [
    {
      channel: 'discord:installCompleted',
      value: { status: 'success', teamId: 8, guildId: '456', guildName: 'KRT Discord' }
    },
    {
      channel: 'discord:installCompleted',
      value: { status: 'error', teamId: 8, message: 'Discord installation failed.' }
    }
  ])
  assert.equal(fixture.overlayShows, 2)
  assert.equal(epochs, 0)
  assert.equal(posts, 0)
})

test('session and profile operations serialize without reverse completion', async () => {
  const session = deferred<CoreCallResult>()
  const sessionStarted = deferred<void>()
  const events: string[] = []
  const fixture = createFixture({
    getServer: async () => {
      events.push(`session:start`)
      sessionStarted.resolve()
      return session.promise
    },
    patchServer: async () => {
      events.push(`profile:start`)
      return result(user(true))
    }
  })
  fixture.auth.register()

  const sessionRequest = fixture.handlers.get(`auth:session`)?.({}) as Promise<CoreCallResult>
  await sessionStarted.promise
  const profileRequest = fixture.handlers.get(`auth:profile`)?.({}, {
    displayName: `Admin`,
    playfabId: `PLAYER`
  }) as Promise<CoreCallResult>
  await Promise.resolve()
  assert.deepEqual(events, [`session:start`])

  session.resolve(result(user(false)))
  assert.equal((await sessionRequest).ok, true)
  assert.equal((await profileRequest).ok, true)
  assert.deepEqual(events, [`session:start`, `profile:start`])
  assert.deepEqual(fixture.auth.getState(), { authenticated: true, onboardingComplete: true })
})

test('protocol login supersedes a logout pending on runtime stop without posting or clearing the new identity', async () => {
  const logoutStop = deferred<void>()
  const stopStarted = deferred<void>()
  let stopCalls = 0
  let logoutPosts = 0
  const fixture = createFixture({
    postServer: async path => {
      if (path === `/auth/logout`) {
        logoutPosts += 1
        return result(null)
      }
      return result({ token: `new-token` })
    },
    getServer: async () => result(user(true))
  })
  fixture.auth.subscribe(async state => {
    if (state.authenticated) return
    stopCalls += 1
    if (stopCalls !== 1) return
    stopStarted.resolve()
    await logoutStop.promise
  })
  fixture.auth.register()

  const logout = fixture.handlers.get(`auth:logout`)?.({}) as Promise<CoreCallResult>
  await stopStarted.promise
  const protocol = fixture.auth.acceptProtocolUrl(`spellbook://auth?ticket=new-ticket`)
  logoutStop.resolve()

  const logoutResult = await logout
  await protocol

  assert.equal(logoutResult.status, 409)
  assert.equal(logoutPosts, 0)
  assert.equal(fixture.tokens.at(-1), `new-token`)
  assert.equal(fixture.sessionEvents.filter(event => event === `clear`).length, 0)
  assert.deepEqual(fixture.auth.getState(), { authenticated: true, onboardingComplete: true })
})

test('protocol login maps a superseded pending logout rejection to stale 409', async () => {
  const logoutPost = deferred<CoreCallResult>()
  const logoutPostStarted = deferred<void>()
  const fixture = createFixture({
    postServer: async path => {
      if (path === `/auth/logout`) {
        logoutPostStarted.resolve()
        return logoutPost.promise
      }
      return result({ token: `new-token` })
    },
    getServer: async () => result(user(true))
  })
  fixture.auth.register()

  const logout = fixture.handlers.get(`auth:logout`)?.({}) as Promise<CoreCallResult>
  await logoutPostStarted.promise
  const protocol = fixture.auth.acceptProtocolUrl(`spellbook://auth?ticket=new-ticket`)
  logoutPost.reject(new Error(`old logout failed`))

  const logoutResult = await logout
  await protocol

  assert.equal(logoutResult.status, 409)
  assert.equal(fixture.tokens.at(-1), `new-token`)
  assert.equal(fixture.sessionEvents.filter(event => event === `clear`).length, 0)
})

test('an ordinary session waits behind logout while runtime stop is pending', async () => {
  const stopStarted = deferred<void>()
  const releaseStop = deferred<void>()
  let postCalls = 0
  let getCalls = 0
  const fixture = createFixture({
    getServer: async () => { getCalls += 1; return result(user(true)) },
    postServer: async () => { postCalls += 1; return result(null) }
  })
  fixture.auth.subscribe(async state => {
    if (state.authenticated) return
    stopStarted.resolve()
    await releaseStop.promise
  })
  fixture.auth.register()

  const logout = fixture.handlers.get(`auth:logout`)?.({}) as Promise<CoreCallResult>
  await stopStarted.promise
  const session = fixture.handlers.get(`auth:session`)?.({}) as Promise<CoreCallResult>
  await Promise.resolve()
  assert.equal(getCalls, 0)
  releaseStop.resolve()
  const logoutResult = await logout
  const sessionResult = await session

  assert.equal(postCalls, 1)
  assert.equal(logoutResult.ok, true)
  assert.equal(sessionResult.ok, true)
  assert.deepEqual(fixture.auth.getState(), { authenticated: true, onboardingComplete: true })
})

test('background 401 invalidation publishes without creating an overlay and ignores 403', async () => {
  const events: string[] = []
  const fixture = createFixture({
    onToken: token => events.push(`token:${token}`),
    onClear: () => events.push(`disk:clear`),
    onSendCurrent: channel => events.push(`send:${channel}`)
  })
  fixture.auth.subscribe(async () => { events.push(`runtime:stop`) })
  const forbidden: CoreCallResult = { ok: false, status: 403, statusText: `Forbidden`, data: null }
  const unauthorized: CoreCallResult = { ok: false, status: 401, statusText: `Unauthorized`, data: null }

  await fixture.auth.invalidateSession(forbidden)
  await fixture.auth.invalidateSession(unauthorized)

  assert.deepEqual(events, [
    `runtime:stop`,
    `token:`,
    `disk:clear`,
    `send:auth:sessionChanged`
  ])
  assert.equal(fixture.overlayCreates, 0)
  assert.equal(fixture.overlayShows, 0)
})

function createFixture(options: {
  token?: string
  getServer?: (path: string) => Promise<CoreCallResult>
  postServer?: (path: string) => Promise<CoreCallResult>
  patchServer?: (path: string) => Promise<CoreCallResult>
  onToken?: (token: string) => void
  onAuthEpoch?: () => void
  onClear?: () => void
  onSave?: () => void
  saveSession?: (token: string, persist: () => void) => Promise<void>
  onSendCurrent?: (channel: string, value: unknown) => void
  onCreatedSend?: (channel: string, value: unknown) => void
  onOpenExternal?: (url: string) => Promise<unknown>
} = {}) {
  const handlers = new Map<string, Handler>()
  const tokens: string[] = []
  const sessionEvents: string[] = []
  let persistedToken = options.token ?? ``
  let overlayCreates = 0
  let overlayShows = 0
  let overlayHides = 0
  const httpClient = {
    getServer: options.getServer ?? (async () => result(user(false))),
    postServer: options.postServer ?? (async () => result(null)),
    patchServer: options.patchServer ?? (async () => result(user(true))),
    setServerAuthToken: (token: string) => {
      tokens.push(token)
      options.onToken?.(token)
    },
    advanceServerAuthEpoch: () => options.onAuthEpoch?.()
  } as unknown as HttpClient
  const sessions = {
    load: async () => persistedToken,
    save: async (token: string) => {
      sessionEvents.push(`save`)
      const persist = () => { persistedToken = token }
      if (options.saveSession) await options.saveSession(token, persist)
      else persist()
      options.onSave?.()
    },
    clear: async () => {
      sessionEvents.push(`clear`)
      persistedToken = ``
      options.onClear?.()
    }
  } as unknown as AuthSessionStore
  const overlay = {
    getOrCreate: () => {
      overlayCreates += 1
      return { webContents: { send: (channel: string, value: unknown) => options.onCreatedSend?.(channel, value) } }
    },
    show: () => { overlayShows += 1 },
    hide: () => { overlayHides += 1 },
    sendToCurrent: (channel: string, value: unknown) => options.onSendCurrent?.(channel, value)
  } as unknown as OverlayWindowController
  const auth = new AuthIpcHandlers(
    { handle: (channel: string, handler: Handler) => handlers.set(channel, handler) } as unknown as IpcMain,
    httpClient,
    sessions,
    overlay,
    options.onOpenExternal
  )

  return {
    auth,
    handlers,
    tokens,
    sessionEvents,
    get persistedToken() { return persistedToken },
    get overlayCreates() { return overlayCreates },
    get overlayShows() { return overlayShows },
    get overlayHides() { return overlayHides }
  }
}

test(`required updates clear the session, stop runtime, and prevent login and restoration`, async () => {
  const events: string[] = []
  const fixture = createFixture({
    token: `old-session`,
    getServer: async () => result(user(true)),
    postServer: async path => { events.push(path); return result(null) },
    onSendCurrent: channel => { events.push(channel) }
  })
  fixture.auth.register()
  await fixture.auth.restoreSession()
  await fixture.auth.requireUpdate()
  assert.equal(fixture.auth.getState().authenticated, false)
  assert.equal(fixture.persistedToken, ``)
  assert.deepEqual(events, [`/auth/logout`, `auth:sessionChanged`])
  const login = await fixture.handlers.get(`auth:login`)?.({}) as CoreCallResult
  assert.equal(login.error?.code, `APP_UPDATE_REQUIRED`)
  assert.equal(await fixture.auth.acceptProtocolUrl(`spellbook://auth?ticket=old`), true)
  await fixture.auth.restoreSession()
  assert.equal(fixture.auth.getState().authenticated, false)
})

test(`required update wins over an in-flight session and retains its notice after background invalidation`, async () => {
  const pending = deferred<CoreCallResult>()
  const started = deferred<void>()
  const notices: unknown[] = []
  const fixture = createFixture({
    token: `old`,
    getServer: async () => { started.resolve(); return pending.promise },
    postServer: async () => { throw new Error(`offline`) },
    onSendCurrent: (_channel, value) => { notices.push(value) }
  })
  fixture.auth.register()
  const restore = fixture.auth.restoreSession()
  await started.promise
  const required = fixture.auth.requireUpdate()
  pending.resolve(result(user(true)))
  await restore
  await required
  await fixture.auth.invalidateSession({ ok: false, status: 401, statusText: `Unauthorized`, data: null })
  assert.equal(fixture.persistedToken, ``)
  assert.equal(fixture.auth.getState().authenticated, false)
  assert.equal(notices.length, 1)
  assert.equal((notices[0] as CoreCallResult).error?.code, `APP_UPDATE_REQUIRED`)
})

test(`renderer session waits for the startup release check and stored token restoration`, async () => {
  const update = deferred<void>()
  let token = ``
  let sessionRequests = 0
  const fixture = createFixture({
    token: `stored`,
    onToken: value => { token = value },
    getServer: async () => {
      sessionRequests += 1
      assert.equal(token, `stored`)
      return result(user(true))
    }
  })
  fixture.auth.register()
  const initialize = async () => {
    await update.promise
    await fixture.auth.restoreSession()
  }
  fixture.auth.setStartupInitialization(initialize())
  const rendererSession = fixture.handlers.get(`auth:session`)?.({}) as Promise<CoreCallResult>
  await Promise.resolve()
  assert.equal(sessionRequests, 0)
  update.resolve()
  assert.equal((await rendererSession).ok, true)
  assert.equal(fixture.persistedToken, `stored`)
  assert.equal(sessionRequests, 2)
})

function deferred<T>(): {
  promise: Promise<T>
  resolve: (value?: T) => void
  reject: (reason?: unknown) => void
} {
  let resolve!: (value?: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((accept, fail) => {
    resolve = accept as (value?: T) => void
    reject = fail
  })
  return { promise, resolve, reject }
}
