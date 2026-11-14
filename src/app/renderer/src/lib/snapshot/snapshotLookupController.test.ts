import assert from 'node:assert/strict'
import test from 'node:test'
import { setImmediate as settle } from 'node:timers/promises'
import { SnapshotLookupController } from './snapshotLookupController'
import type { SnapshotLookupEvent } from '@spellbook/shared/snapshotLookup'
import type { PlayerState } from '$lib/types/playerState'
import type { ToastRequest } from '$lib/core'

function fixture(opened = true) {
  const actions: string[] = []
  let listener: (event: SnapshotLookupEvent) => void = () => {}
  const context = { user: { id: 7 }, connectionGeneration: 1, gameServerId: 13,
    available: true, players: [{ playfabId: `P1`, isOnline: true }] }
  const dependencies = {
    api: { onSnapshotLookup: (callback: typeof listener) => {
      listener = callback
      return () => actions.push(`unsubscribe`)
    }, show: async () => { actions.push(`show`) }, showToast: async (_request: ToastRequest) => {
      actions.push(`toast`)
      return true
    }, hideToast: async (group?: string) => { actions.push(`clear:${group}`) } },
    resolvePlayer: async (): Promise<PlayerState | null> => ({ playfabId: `P1` } as PlayerState),
    context: () => context,
    onMatch: async (_player: unknown, isCurrent: () => boolean) => {
      actions.push(`navigate`)
      return opened && isCurrent()
    },
    play: (cue: string) => {
      actions.push(cue)
      return cue === `recording` ? { stop: () => { actions.push(`stopRecording`) } } : null
    },
    record: () => { actions.push(`record`) }
  }
  const controller = new SnapshotLookupController(dependencies)
  const dispose = controller.listen()
  const start = (id = `one`) => listener({ phase: `started`, requestId: id })
  const finish = (id = `one`, ok = true) => listener({ phase: `finished`, requestId: id, ok,
    match: ok ? { gameServerId: 13, playfabId: `P1` } : undefined })
  return { controller, dependencies, context, actions, dispose, start, finish, invalidate: () => { context.available = false } }
}

test(`context changes during player resolution or an open prompt prevent obsolete selection and success`, async () => {
  for (const stage of [`resolve`, `prompt`]) for (const change of [`playerLeft`, `rejoined`, `account`]) {
    const f = fixture()
    const waiting = Promise.withResolvers<void>()
    const resolve = f.dependencies.resolvePlayer
    if (stage === `resolve`) f.dependencies.resolvePlayer = async () => {
      await waiting.promise
      return resolve()
    }
    f.dependencies.onMatch = async (_player, current) => {
      if (stage === `prompt`) await waiting.promise
      if (!current()) return false
      f.actions.push(`selected`)
      return true
    }
    f.start()
    f.finish()
    try {
      await settle()
      if (change === `playerLeft`) f.context.players = []
      else if (change === `rejoined`) f.context.connectionGeneration++
      else f.context.user = { id: 8 }
      waiting.resolve()
      await settle()
      assert.ok(!f.actions.includes(`selected`), `${stage}/${change}`)
      assert.ok(!f.actions.includes(`purchase`), `${stage}/${change}`)
    } finally {
      waiting.resolve()
      f.dispose()
    }
  }
})

test(`one play cue and one purchase follow overlay opening, confirmed navigation and F4 notification cleanup`, async () => {
  const f = fixture()
  f.start()
  f.start()
  f.finish()
  f.finish()
  await settle()
  assert.deepEqual(f.actions, [`play`, `show`, `navigate`, `clear:snapshotLookup`, `purchase`])
  f.dispose()
})

test(`failed lookup or cancelled navigation cannot play success`, async () => {
  for (const kind of [`failure`, `cancel`, `context`]) {
    const f = fixture(kind !== `cancel`)
    f.start()
    if (kind === `context`) f.invalidate()
    f.finish(`one`, kind !== `failure`)
    await settle()
    assert.ok(!f.actions.includes(`purchase`))
    assert.ok(!f.actions.includes(`clear:snapshotLookup`))
    assert.equal(f.actions.includes(`sleep`), kind === `failure`)
    f.dispose()
  }
})

test(`late results and disposed listeners cannot play delayed success`, async () => {
  const f = fixture()
  f.start(`old`)
  f.start(`new`)
  f.finish(`old`)
  await settle()
  assert.deepEqual(f.actions, [`play`, `play`])
  f.dispose()
  f.finish(`new`)
  await settle()
  assert.ok(!f.actions.includes(`purchase`))
})

test(`unavailable audio does not prevent player opening`, async () => {
  let listener: (event: SnapshotLookupEvent) => void = () => {}
  let opened = false
  const user = { id: 7 }
  const controller = new SnapshotLookupController({ api: { onSnapshotLookup: (callback: typeof listener) => {
    listener = callback
    return () => {}
  },
    show: async () => {}, showToast: async () => true, hideToast: async () => {} }, resolvePlayer: async () => ({ playfabId: `P1` } as never),
    context: () => ({ user, connectionGeneration: 1, gameServerId: 13,
      available: true, players: [{ playfabId: `P1`, isOnline: true }] }), onMatch: async () => {
      opened = true
      return true
    }, play: () => { throw new Error(`No audio`) }, record: () => {} })
  const dispose = controller.listen()
  listener({ phase: `started`, requestId: `one` })
  listener({ phase: `finished`, requestId: `one`, ok: true, match: { gameServerId: 13, playfabId: `P1` } })
  await settle()
  assert.equal(opened, true)
  dispose()
})

test(`loading starts the recording loop after one second and stops before the result cue`, async context => {
  context.mock.timers.enable({ apis: [`setTimeout`] })
  for (const ok of [true, false]) {
    const f = fixture()
    f.start()
    f.start()
    context.mock.timers.tick(999)
    assert.deepEqual(f.actions, [`play`])
    context.mock.timers.tick(1)
    assert.deepEqual(f.actions, [`play`, `recording`])
    context.mock.timers.tick(2000)
    assert.equal(f.actions.filter(action => action === `recording`).length, 1)
    f.finish(`one`, ok)
    f.finish(`one`, ok)
    await settle()
    assert.equal(f.actions.filter(action => action === `stopRecording`).length, 1)
    assert.ok(f.actions.indexOf(`stopRecording`) < f.actions.indexOf(ok ? `purchase` : `sleep`))
    f.dispose()
  }
})

test(`completed, replaced and disposed lookups cancel pending or active loading audio`, async context => {
  context.mock.timers.enable({ apis: [`setTimeout`] })
  for (const stage of [`pending`, `playing`]) for (const end of [`finish`, `replace`, `dispose`]) {
    const f = fixture()
    f.start()
    if (stage === `playing`) context.mock.timers.tick(1000)
    if (end === `finish`) f.finish(`one`, false)
    else if (end === `replace`) f.start(`new`)
    else f.dispose()
    await settle()
    assert.equal(f.actions.includes(`stopRecording`), stage === `playing`, `${stage}/${end}`)
    f.dispose()
    const played = f.actions.filter(action => action === `recording`).length
    context.mock.timers.tick(2000)
    assert.equal(f.actions.filter(action => action === `recording`).length, played, `${stage}/${end}`)
  }
})

test(`lookup failure and player-opening errors use the sleep cue and tag their messages`, async () => {
  for (const kind of [`lookup`, `missing`, `opening`]) {
    const f = fixture()
    const notifications: unknown[] = []
    f.dependencies.api.showToast = async request => { notifications.push(request); return true }
    if (kind === `missing`) f.dependencies.resolvePlayer = async () => null
    if (kind === `opening`) f.dependencies.onMatch = async () => { throw new Error(`Cannot open`) }
    f.start()
    f.finish(`one`, kind !== `lookup`)
    await settle()
    assert.equal(f.actions.filter(action => action === `sleep`).length, 1, kind)
    assert.equal((notifications[0] as { group: string }).group, `snapshotLookup`)
    assert.ok(!f.actions.includes(`purchase`))
    f.dispose()
  }
})

test(`failed notification cleanup cannot prevent success and context changes during cleanup suppress its cue`, async () => {
  for (const changed of [false, true]) {
    const f = fixture()
    f.dependencies.api.hideToast = async () => {
      if (changed) f.invalidate()
      throw new Error(`Cannot hide`)
    }
    f.start()
    f.finish()
    await settle()
    assert.equal(f.actions.includes(`purchase`), !changed)
    f.dispose()
  }
})
