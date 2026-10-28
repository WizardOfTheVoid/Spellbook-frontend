import assert from 'node:assert/strict'
import test from 'node:test'
import { get } from 'svelte/store'
import { createAppUpdateStore } from './appUpdateStore'
import type { AppUpdateApi, AppUpdateState } from '../../../../shared/appUpdate'

const ready: AppUpdateState = {
  phase: `ready`,
  version: `3.5.1`,
  required: false,
  percent: 100,
  error: null,
  restartRequired: false,
}
const settle = async () => {
  await new Promise((resolve) => setImmediate(resolve))
}

function fixture(canLeave = async () => true) {
  let listener: ((state: AppUpdateState) => void) | undefined
  let reads = 0
  let checks = 0
  let installs = 0
  let restarts = 0
  let unsubscriptions = 0
  const snapshot = Promise.withResolvers<AppUpdateState>()
  const api: AppUpdateApi = {
    getUpdateState: async () => {
      reads += 1
      return snapshot.promise
    },
    onUpdateChanged: (next) => {
      listener = next
      return () => {
        unsubscriptions += 1
        listener = undefined
      }
    },
    checkForUpdate: async () => {
      checks += 1
      return ready.version
    },
    installUpdate: async () => {
      installs += 1
    },
    restartApplication: async () => {
      restarts += 1
    },
    openUpdatePage: async () => undefined,
  }
  const store = createAppUpdateStore({ api: () => api, canLeave })
  return {
    store,
    snapshot,
    emit: (state: AppUpdateState) => listener?.(state),
    counts: () => ({ reads, checks, installs, restarts, unsubscriptions }),
  }
}

test(`connection subscribes before snapshot and late snapshot cannot overwrite an event`, async () => {
  const { store, snapshot, emit, counts } = fixture()
  const disconnect = store.connect()
  emit(ready)
  snapshot.resolve({ ...ready, phase: `downloading`, percent: 20 })
  await settle()
  assert.equal(get(store).state.phase, `ready`)
  store.open()
  store.close()
  assert.equal(get(store).open, false)
  assert.deepEqual(counts(), { reads: 1, checks: 0, installs: 0, restarts: 0, unsubscriptions: 0 })
  disconnect()
})

test(`disconnect invalidates pending reads and remount uses a fresh subscription`, async () => {
  const { store, snapshot, emit, counts } = fixture()
  const disconnect = store.connect()
  disconnect()
  snapshot.resolve(ready)
  await settle()
  assert.equal(get(store).state.version, null)
  const disconnectAgain = store.connect()
  emit({ ...ready, phase: `downloading` })
  assert.equal(get(store).state.phase, `downloading`)
  assert.equal(counts().checks, 0)
  disconnectAgain()
  assert.equal(counts().unsubscriptions, 2)
})

test(`declining unsaved changes keeps the update ready without installing`, async () => {
  const { store, emit } = fixture(async () => false)
  const stop = store.connect()
  emit(ready)
  store.open()
  await store.install()
  assert.equal(get(store).state.phase, `ready`)
  assert.equal(get(store).open, true)
  assert.equal(get(store).pending, false)
  stop()
})

for (const invalidate of [`disconnect`, `version`, `checking`]) {
  test(`confirmation revalidates after ${invalidate} and suppresses duplicate clicks`, async () => {
    const confirm = Promise.withResolvers<boolean>()
    const { store, emit, counts } = fixture(() => confirm.promise)
    const stop = store.connect()
    emit(ready)
    const first = store.install()
    await store.install()
    if (invalidate === `disconnect`) stop()
    else
      emit({
        ...ready,
        version: invalidate === `version` ? `3.6.0` : ready.version,
        phase: invalidate === `checking` ? `checking` : `ready`,
      })
    confirm.resolve(true)
    await first
    assert.equal(counts().installs, 0)
    stop()
  })
}

test(`accepted confirmation sends one install request`, async () => {
  const { store, emit, counts } = fixture()
  const stop = store.connect()
  emit(ready)
  await Promise.all([store.install(), store.install()])
  assert.equal(counts().installs, 1)
  stop()
})

test(`restart-required snapshot forces the recovery panel open and cannot be dismissed or retried`, async () => {
  const { store, snapshot, counts } = fixture()
  const stop = store.connect()
  snapshot.resolve({ ...ready, phase: `error`, restartRequired: true })
  await settle()
  assert.equal(get(store).open, true)
  store.close()
  assert.equal(get(store).open, true)
  await store.retry()
  assert.equal(counts().checks, 0)
  await store.restart()
  assert.equal(counts().restarts, 1)
  stop()
})

test(`forced updates open the shared panel and cannot be dismissed while downloading or ready`, async () => {
  const { store, emit, counts } = fixture(async () => false)
  const stop = store.connect()
  emit({ ...ready, required: true, phase: `downloading` })
  assert.equal(get(store).open, true)
  store.close()
  assert.equal(get(store).open, true)
  emit({ ...ready, required: true })
  await store.install()
  assert.equal(counts().installs, 0)
  assert.equal(get(store).open, true)
  assert.equal(get(store).state.restartRequired, false)
  stop()
})
