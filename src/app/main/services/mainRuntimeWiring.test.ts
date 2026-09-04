import assert from 'node:assert/strict'
import test from 'node:test'
import type { CoreCallResult } from '../types'
import {
  initializeWindowBeforeAuth,
  sessionInvalidationHandler
} from './mainRuntimeWiring'

test('session invalidation wiring returns the auth handler promise', async () => {
  const failure = new Error(`session clear failed`)
  const handler = sessionInvalidationHandler({
    invalidateSession: async () => { throw failure }
  })

  await assert.rejects(handler(unauthorized()), failure)
})

test('cold start creates the renderer before waiting for an initial protocol intent', async () => {
  const events: string[] = []
  const protocol = deferred<void>()
  const initialization = initializeWindowBeforeAuth({
    registerIpc: () => events.push(`ipc:register`),
    restoreSession: async () => { events.push(`session:restore`) },
    initialAuthUrl: `spellbook://auth?ticket=cold-start`,
    acceptProtocolUrl: async () => {
      events.push(`protocol:start`)
      await protocol.promise
      events.push(`protocol:done`)
      return true
    },
    createWindow: () => events.push(`window:create`),
    handleSessionFailure: () => events.push(`session:failure`)
  })

  await Promise.resolve()
	assert.deepEqual(events, [`ipc:register`, `window:create`, `protocol:start`])

  protocol.resolve()
  await initialization
	assert.deepEqual(events, [
		`ipc:register`,
		`window:create`,
		`protocol:start`,
		`protocol:done`
  ])
})

test('cold start restores the stored session when no initial protocol intent is accepted', async () => {
  const events: string[] = []

  await initializeWindowBeforeAuth({
    registerIpc: () => events.push(`ipc:register`),
    restoreSession: async () => { events.push(`session:restore`) },
    initialAuthUrl: `spellbook://auth`,
    acceptProtocolUrl: async () => {
      events.push(`protocol:reject`)
      return false
    },
    createWindow: () => events.push(`window:create`),
    handleSessionFailure: () => events.push(`session:failure`)
  })

	assert.deepEqual(events, [
		`ipc:register`,
		`window:create`,
		`protocol:reject`,
		`session:restore`
  ])
})

test('cold start contains session restoration failures after creating the renderer', async () => {
  const events: string[] = []
  const failure = new Error('Offline')

  await initializeWindowBeforeAuth({
    registerIpc: () => events.push('ipc:register'),
    restoreSession: async () => { throw failure },
    acceptProtocolUrl: async () => false,
    createWindow: () => events.push('window:create'),
    handleSessionFailure: error => events.push(error === failure ? 'session:failure' : 'wrong:error')
  })

  assert.deepEqual(events, ['ipc:register', 'window:create', 'session:failure'])
})

function unauthorized(): CoreCallResult {
  return { ok: false, status: 401, statusText: `Unauthorized`, data: null }
}

function deferred<T>() {
  let resolve!: (value?: T) => void
  const promise = new Promise<T>(next => { resolve = next as (value?: T) => void })
  return { promise, resolve }
}
