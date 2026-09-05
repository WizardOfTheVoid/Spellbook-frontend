import assert from 'node:assert/strict'
import test from 'node:test'

type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

test('mock reads the current snapshot at submission and preserves the exact matching name', async () => {
  const module = await import('./wantedAdminController.js').catch(() => ({}))
  const Controller = Reflect.get(module, 'WantedAdminController')
  assert.ok(Controller)

  const calls: unknown[] = []
  let snapshotName = 'First name'
  const controller = new Controller({
    currentGameSnapshot: async () => ({
      gameServerId: 17,
      players: [{ playfabId: 'PF-1', name: snapshotName }]
    }),
    fetchPlayerProfile: async () => { throw new Error('unexpected profile lookup') },
    getWantedPlayer: async () => { throw new Error('unexpected Wanted lookup') },
    createMock: async (input: unknown) => { calls.push(input) },
    revert: async () => { throw new Error('unexpected revert') },
    confirm: () => false
  })
  controller.setContext(3, true)
  snapshotName = 'Exact live Name'

  const outcome = await controller.runMock(' PF-1 ')

  assert.equal(outcome?.ok, true)
  assert.deepEqual(calls, [{ playfabId: 'PF-1', playerName: 'Exact live Name', gameServerId: 17 }])
})

test('mock refuses an unresolved server before creating desired state', async () => {
  const { WantedAdminController } = await import('./wantedAdminController.js')
  let creates = 0
  const controller = new WantedAdminController({
    currentGameSnapshot: async () => ({ gameServerId: 0, players: [] }),
    fetchPlayerProfile: async () => { throw new Error('unused') },
    getWantedPlayer: async () => null,
    createMock: async () => { creates += 1 },
    revert: async () => undefined,
    confirm: () => false
  })
  controller.setContext(3, true)

  const outcome = await controller.runMock('PF-1')

  assert.equal(outcome?.ok, false)
  assert.equal(creates, 0)
})

test('revert resolves profile and current ban before confirmation and mutation', async () => {
  const { WantedAdminController } = await import('./wantedAdminController.js')
  const calls: unknown[] = []
  const controller = new WantedAdminController({
    currentGameSnapshot: async () => null,
    fetchPlayerProfile: async (playfabId: string) => {
      calls.push(['profile', playfabId])
      return { player: { id: 41, playfabId } }
    },
    getWantedPlayer: async (playerId: number) => {
      calls.push(['wanted', playerId])
      return { sourceAction: { id: 73, actionType: 'ban' } }
    },
    createMock: async () => undefined,
    revert: async (playerId: number, sourceActionId: number) => {
      calls.push(['revert', playerId, sourceActionId])
    },
    confirm: () => {
      calls.push(['confirm'])
      return true
    }
  })
  controller.setContext(3, true)

  const outcome = await controller.runRevert(' PF-1 ')

  assert.equal(outcome?.ok, true)
  assert.deepEqual(calls, [
    ['profile', 'PF-1'],
    ['wanted', 41],
    ['confirm'],
    ['revert', 41, 73]
  ])
})

test('revert rejects mock and unban sources before confirmation', async () => {
  const { WantedAdminController } = await import('./wantedAdminController.js')
  let confirmations = 0
  let reverts = 0
  const controller = new WantedAdminController({
    currentGameSnapshot: async () => null,
    fetchPlayerProfile: async () => ({ player: { id: 41, playfabId: 'PF-1' } }),
    getWantedPlayer: async () => ({ sourceAction: { id: 73, actionType: 'mock' } }),
    createMock: async () => undefined,
    revert: async () => { reverts += 1 },
    confirm: () => { confirmations += 1; return true }
  })
  controller.setContext(3, true)

  const outcome = await controller.runRevert('PF-1')

  assert.equal(outcome?.ok, false)
  assert.equal(confirmations, 0)
  assert.equal(reverts, 0)
})

test('navigation and session replacement suppress stale outcomes and release single flight', async () => {
  const { WantedAdminController } = await import('./wantedAdminController.js')
  const firstSnapshot = deferred<{ gameServerId: number, players: never[] }>()
  let snapshotCalls = 0
  const controller = new WantedAdminController({
    currentGameSnapshot: async () => {
      snapshotCalls += 1
      return snapshotCalls === 1
        ? firstSnapshot.promise
        : { gameServerId: 9, players: [] }
    },
    fetchPlayerProfile: async () => { throw new Error('unused') },
    getWantedPlayer: async () => null,
    createMock: async () => undefined,
    revert: async () => undefined,
    confirm: () => false
  })
  controller.setContext(3, true)
  const stale = controller.runMock('PF-1')

  controller.setContext(3, false)
  controller.setContext(4, true)
  const fresh = await controller.runMock('PF-2')
  firstSnapshot.resolve({ gameServerId: 7, players: [] })

  assert.equal(fresh?.ok, true)
  assert.equal(await stale, null)
  assert.equal(controller.state.running, null)
})

test('destroy suppresses a late mutation result', async () => {
  const { WantedAdminController } = await import('./wantedAdminController.js')
  const create = deferred<void>()
  const controller = new WantedAdminController({
    currentGameSnapshot: async () => ({ gameServerId: 9, players: [] }),
    fetchPlayerProfile: async () => { throw new Error('unused') },
    getWantedPlayer: async () => null,
    createMock: async () => create.promise,
    revert: async () => undefined,
    confirm: () => false
  })
  controller.setContext(3, true)
  const pending = controller.runMock('PF-1')
  await Promise.resolve()

  controller.destroy()
  create.resolve()

  assert.equal(await pending, null)
})
