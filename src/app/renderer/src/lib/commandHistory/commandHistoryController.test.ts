import assert from 'node:assert/strict'
import test from 'node:test'
import { setImmediate } from 'node:timers/promises'
import { CommandHistoryController } from './commandHistoryController'
import { initialCommandHistoryState, type CommandHistoryState } from '../../../../shared/commandHistory/commandHistory'

test(`subscription events beat an older initial snapshot and leaving the tab ignores late delivery`, async () => {
  let receive!: (state: CommandHistoryState) => void
  let finish!: (state: CommandHistoryState) => void
  let unsubscribed = 0
  let reads = 0
  const controller = new CommandHistoryController({
    commandHistory: async () => { reads++; return new Promise(resolve => { finish = resolve }) },
    onCommandHistoryChanged: listener => { receive = listener; return () => { unsubscribed++ } }
  })
  controller.setActive(true)
  controller.setActive(true)
  receive({ ...initialCommandHistoryState, revision: 4, total: 20, status: `monitoring` })
  finish({ ...initialCommandHistoryState, revision: 3, total: 10 })
  await setImmediate()
  assert.equal(controller.state.total, 20)
  assert.equal(reads, 1)
  controller.setActive(false)
  receive({ ...initialCommandHistoryState, revision: 5, total: 99 })
  assert.equal(controller.state.total, 20)
  assert.equal(unsubscribed, 1)
  controller.setActive(true)
  finish({ ...initialCommandHistoryState, revision: 6, total: 30, status: `monitoring` })
  await setImmediate()
  assert.equal(controller.state.total, 30)
  assert.equal(reads, 2)
  controller.setActive(false)
})

test(`a failed initial snapshot exposes an error and a subsequent event clears it`, async () => {
  let receive!: (state: CommandHistoryState) => void
  const controller = new CommandHistoryController({
    commandHistory: async () => { throw new Error(`IPC unavailable`) },
    onCommandHistoryChanged: listener => { receive = listener; return () => {} }
  })
  controller.setActive(true)
  await setImmediate()
  assert.ok(controller.error)
  receive({ ...initialCommandHistoryState, revision: 1, status: `monitoring` })
  assert.equal(controller.error, ``)
  controller.setActive(false)
})
