import assert from 'node:assert/strict'
import test from 'node:test'
import { get } from 'svelte/store'
import type { CoreCallResult, UserSession } from '$lib/core'
import {
  authState,
  completeOnboarding,
  listenForSessionChanges,
  loadSession,
  logout,
  startupState,
  User
} from './user'

test('failed session restore settles startup signed out with a recoverable error', async () => {
  installAuthBridge({ session: async () => { throw new Error('Offline') } })

  await loadSession()

  assert.deepEqual(get(startupState), { phase: 'signed-out', error: 'Offline', errorCode: null })
  assert.deepEqual(get(authState), { loading: false, user: null })
})

test('a suspended session event signs out with its saved reason and account notice code', async () => {
  const bridge = installAuthBridge()
  const stop = listenForSessionChanges()

  bridge.emit({
    ok: false,
    status: 401,
    statusText: `Unauthorized`,
    data: {
      ok: false,
      error: { code: `ACCOUNT_SUSPENDED`, message: `Access revoked for abuse.\nRepeated harassment.` }
    }
  })
  await Promise.resolve()

  assert.deepEqual(get(startupState), {
    phase: `signed-out`,
    error: `Access revoked for abuse.\nRepeated harassment.`,
    errorCode: `ACCOUNT_SUSPENDED`
  })
  assert.equal(get(authState).user, null)
  stop()
})

test('identifies only superadmins as superadmin', () => {
  User.Ability.setUser(session(false))
  assert.equal(User.is('superadmin'), false)

  User.Ability.setUser(session(true))
  assert.equal(User.is('superadmin'), true)
})

test(`pending users keep their renderer session without app permissions and unlock on approval`, async () => {
  const pending = { ...session(true), isActive: false }
  const bridge = installAuthBridge({ session: async () => success(pending) })
  const stop = listenForSessionChanges()
  await loadSession()
  assert.deepEqual(get(authState), { loading: false, user: pending })
  assert.equal(User.is(`superadmin`), false)
  assert.equal(User.Ability.can(`edit`, { type: `user`, id: pending.id }), false)
  bridge.emit(success({ ...pending, isActive: true }))
  await Promise.resolve()
  assert.equal(get(authState).user?.isActive, true)
  assert.equal(User.is(`superadmin`), true)
  stop()
})

test('a session-change event beats an older load-session response', async () => {
  const sessionRequest = deferred<CoreCallResult>()
  const bridge = installAuthBridge({ session: () => sessionRequest.promise })
  const stop = listenForSessionChanges()
  const loading = loadSession()
  const current = session(false, 22)

  bridge.emit(success(current))
  sessionRequest.resolve(success(session(false, 11)))
  await loading

  assert.equal(get(authState).user?.id, 22)
  stop()
})

test('a session-change event beats an older profile response', async () => {
  const profileRequest = deferred<CoreCallResult>()
  const bridge = installAuthBridge({ updateProfile: () => profileRequest.promise })
  const stop = listenForSessionChanges()
  const updating = completeOnboarding(`Admin`, `PLAYER`)
  const current = session(false, 32)

  bridge.emit(success(current))
  profileRequest.resolve(success(session(false, 31)))
  await updating

  assert.equal(get(authState).user?.id, 32)
  stop()
})

test('logout ignores stale 409 and cannot clear a newer session event', async () => {
  const logoutRequest = deferred<CoreCallResult>()
  const bridge = installAuthBridge({ logout: () => logoutRequest.promise })
  const stop = listenForSessionChanges()
  const loggingOut = logout()
  const current = session(false, 42)

  bridge.emit(success(current))
  logoutRequest.resolve({
    ok: false,
    status: 409,
    statusText: `STALE_AUTH_REQUEST`,
    data: null,
    error: { code: `STALE_AUTH_REQUEST`, message: `New login won.` }
  })

  await loggingOut
  assert.equal(get(authState).user?.id, 42)
  stop()
})

test(`logging out an already suspended session clears its notice without an error`, async () => {
  const suspended: CoreCallResult = {
    ok: false, status: 401, statusText: `Unauthorized`,
    data: { ok: false, error: { code: `ACCOUNT_SUSPENDED`, message: `Suspended` } }
  }
  const bridge = installAuthBridge({ logout: async () => suspended })
  const stop = listenForSessionChanges()
  bridge.emit(suspended)
  await Promise.resolve()
  assert.equal(get(startupState).errorCode, `ACCOUNT_SUSPENDED`)
  await logout()
  assert.deepEqual(get(startupState), { phase: `signed-out`, error: null, errorCode: null })
  stop()
})

test('failed completed logout clears the local session after Main cleared its token', async () => {
  const bridge = installAuthBridge()
  const stop = listenForSessionChanges()
  bridge.emit(success(session(false, 52)))
  await Promise.resolve()
  installAuthBridge({
    logout: async () => ({
      ok: false,
      status: 503,
      statusText: `SERVER_UNAVAILABLE`,
      data: null,
      error: { code: `SERVER_UNAVAILABLE`, message: `Server unavailable.` }
    })
  })

  await assert.rejects(logout(), /Server unavailable/u)
  assert.equal(get(authState).user, null)
  stop()
})

test('thrown current logout clears the local session after Main finally cleanup', async () => {
  const bridge = installAuthBridge()
  const stop = listenForSessionChanges()
  bridge.emit(success(session(false, 62)))
  await Promise.resolve()
  installAuthBridge({
    logout: async () => { throw new Error(`logout transport failed`) }
  })

  await assert.rejects(logout(), /logout transport failed/u)
  assert.equal(get(authState).user, null)
  stop()
})

function session(isSuperadmin: boolean, id = 7): UserSession {
  return {
    id,
    discordId: '123',
    username: 'moderator',
    displayName: 'Moderator',
    playfabId: 'PLAYFAB',
    avatarUrl: null,
    isSuperadmin,
    isActive: true,
    wantedCreationEnabled: isSuperadmin,
    onboardingComplete: false
  }
}

function success(user: UserSession): CoreCallResult {
  return {
    ok: true,
    status: 200,
    statusText: `OK`,
    data: { ok: true, data: user }
  }
}

function installAuthBridge(overrides: Partial<{
  session: () => Promise<CoreCallResult>
  updateProfile: () => Promise<CoreCallResult>
  logout: () => Promise<CoreCallResult>
}> = {}) {
  let listener: ((result: CoreCallResult) => void) | null = null
  Object.defineProperty(globalThis, `window`, {
    configurable: true,
    value: {
      chivAuth: {
        login: async () => success(session(false)),
        session: overrides.session ?? (async () => success(session(false))),
        updateProfile: overrides.updateProfile ?? (async () => success(session(false))),
        logout: overrides.logout ?? (async () => success(session(false))),
        onSessionChange: (next: (result: CoreCallResult) => void) => {
          listener = next
          return () => { listener = null }
        }
      }
    }
  })
  return {
    emit: (result: CoreCallResult) => listener?.(result)
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(next => { resolve = next })
  return { promise, resolve }
}
