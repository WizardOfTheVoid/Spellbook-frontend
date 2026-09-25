import assert from 'node:assert/strict'
import test from 'node:test'
import { openPendingPlayerLink, visitPlayerLink, type PlayerLinkPorts } from './playerLinkNavigation'

type Profile = { playfabId: string }

function setup() {
  const events: string[] = []
  let ready = true
  let current: { sequence: number, playfabId: string } | null = { sequence: 7, playfabId: `ABC_123` }
  let fetch = async (playfabId: string): Promise<Profile> => ({ playfabId })
  let navigate = async (profile: Profile, sequence: number): Promise<boolean> => {
    events.push(`navigate:${profile.playfabId}:${sequence}`)
    return true
  }
  const ports: PlayerLinkPorts<Profile> = {
    ready: () => ready,
    current: async () => current,
    fetch: async playfabId => { events.push(`fetch:${playfabId}`); return fetch(playfabId) },
    profileId: profile => profile.playfabId,
    navigate: async (profile, sequence) => navigate(profile, sequence),
    acknowledge: async sequence => { events.push(`ack:${sequence}`); current = null; return true },
    invalid: message => { events.push(`invalid:${message}`) }
  }
  return {
    events, ports,
    setReady: (value: boolean) => { ready = value },
    setCurrent: (value: typeof current) => { current = value },
    setFetch: (value: typeof fetch) => { fetch = value },
    setNavigate: (value: typeof navigate) => { navigate = value },
    current: () => current
  }
}

test(`ready player link opens the fetched profile and acknowledges it`, async () => {
  const state = setup()
  await openPendingPlayerLink({ sequence: 7, playfabId: `ABC_123` }, state.ports)
  assert.deepEqual(state.events, [`fetch:ABC_123`, `navigate:ABC_123:7`, `ack:7`])
})

test(`signed-out or suspended account keeps the target for later login`, async () => {
  const state = setup()
  state.setReady(false)
  await openPendingPlayerLink({ sequence: 7, playfabId: `ABC_123` }, state.ports)
  assert.deepEqual(state.events, [])
  assert.equal(state.current()?.playfabId, `ABC_123`)
  state.setReady(true)
  await openPendingPlayerLink({ sequence: 7, playfabId: `ABC_123` }, state.ports)
  assert.deepEqual(state.events, [`fetch:ABC_123`, `navigate:ABC_123:7`, `ack:7`])
})

test(`missing player and canceled navigation report failure without changing profile`, async () => {
  const missing = setup()
  missing.setFetch(async () => { throw new Error(`404`) })
  await openPendingPlayerLink({ sequence: 7, playfabId: `ABC_123` }, missing.ports)
  assert.equal(missing.events.some(event => event.startsWith(`navigate:`)), false)
  assert.equal(missing.events.at(-1), `ack:7`)
  const canceled = setup()
  canceled.setNavigate(async () => false)
  await openPendingPlayerLink({ sequence: 7, playfabId: `ABC_123` }, canceled.ports)
  assert.equal(canceled.events.some(event => event.startsWith(`invalid:`)), true)
  assert.equal(canceled.events.at(-1), `ack:7`)
})

test(`a mismatched profile never opens another player`, async () => {
  const state = setup()
  state.setFetch(async () => ({ playfabId: `DEF_456` }))
  await openPendingPlayerLink({ sequence: 7, playfabId: `ABC_123` }, state.ports)
  assert.equal(state.events.some(event => event.startsWith(`navigate:`)), false)
  assert.equal(state.events.at(-1), `ack:7`)
})

test(`logout or a newer link during fetch leaves the current target intact`, async () => {
  for (const change of [`logout`, `newer`] as const) {
    const state = setup()
    let finishFetch!: (profile: Profile) => void
    state.setFetch(() => new Promise(resolve => { finishFetch = resolve }))
    const opening = openPendingPlayerLink({ sequence: 7, playfabId: `ABC_123` }, state.ports)
    await Promise.resolve()
    if (change === `logout`) state.setReady(false)
    else state.setCurrent({ sequence: 8, playfabId: `DEF_456` })
    finishFetch({ playfabId: `ABC_123` })
    await opening
    assert.equal(state.events.some(event => event.startsWith(`navigate:`) || event.startsWith(`ack:`)), false)
    assert.equal(state.current()?.playfabId, change === `logout` ? `ABC_123` : `DEF_456`)
  }
})

test(`logout while checking the current link prevents navigation and acknowledgement`, async () => {
  const state = setup()
  let finishCurrent!: (value: { sequence: number, playfabId: string }) => void
  let currentRequested!: () => void
  const requested = new Promise<void>(resolve => { currentRequested = resolve })
  state.ports.current = async () => {
    currentRequested()
    return new Promise(resolve => { finishCurrent = resolve })
  }
  const opening = openPendingPlayerLink({ sequence: 7, playfabId: `ABC_123` }, state.ports)
  await requested
  state.setReady(false)
  finishCurrent({ sequence: 7, playfabId: `ABC_123` })
  await opening
  assert.deepEqual(state.events, [`fetch:ABC_123`])
})

test(`logout while checking a failed link prevents its error and acknowledgement`, async () => {
  const state = setup()
  state.setFetch(async () => { throw new Error(`404`) })
  state.ports.current = async () => {
    state.setReady(false)
    return { sequence: 7, playfabId: `ABC_123` }
  }
  await openPendingPlayerLink({ sequence: 7, playfabId: `ABC_123` }, state.ports)
  assert.deepEqual(state.events, [`fetch:ABC_123`])
})

test(`logout after a visit starts prevents acknowledgement`, async () => {
  const state = setup()
  let checks = 0
  state.ports.current = async () => {
    checks += 1
    if (checks === 2) state.setReady(false)
    return { sequence: 7, playfabId: `ABC_123` }
  }
  await openPendingPlayerLink({ sequence: 7, playfabId: `ABC_123` }, state.ports)
  assert.deepEqual(state.events, [`fetch:ABC_123`, `navigate:ABC_123:7`])
})

test(`logout during the final pending-link check prevents profile assignment`, async () => {
  let ready = true
  const opened: string[] = []
  const result = await visitPlayerLink({ playfabId: `ABC_123` }, 7, {
    ready: () => ready,
    current: async () => { ready = false; return { sequence: 7, playfabId: `ABC_123` } },
    canLeave: async () => true,
    visit: async action => action(),
    open: profile => { opened.push(profile.playfabId) }
  })
  assert.equal(result, false)
  assert.deepEqual(opened, [])
})

test(`an unsaved-change refusal or newer link prevents profile assignment`, async () => {
  for (const scenario of [`refused`, `newer`] as const) {
    const opened: string[] = []
    const result = await visitPlayerLink({ playfabId: `ABC_123` }, 7, {
      ready: () => true,
      current: async () => ({ sequence: scenario === `newer` ? 8 : 7, playfabId: `DEF_456` }),
      canLeave: async () => scenario !== `refused`,
      visit: async action => action(),
      open: profile => { opened.push(profile.playfabId) }
    })
    assert.equal(result, false)
    assert.deepEqual(opened, [])
  }
})
