import assert from 'node:assert/strict'
import test from 'node:test'
import { setImmediate } from 'node:timers/promises'
import { InputHistoryController, type InputConfig } from './inputHistoryController'

function config(history: string[]): InputConfig {
  return { file: `Input.ini`, sections: { [`/Script/TBL.TBLConsole`]: { HistoryBuffer: history } } }
}

test(`shows only the last ten commands in file order, preserving duplicates and arguments`, async () => {
  const controller = new InputHistoryController(async () => config([
    `old-one`, `old-two`, `ListPlayers`, `Serversay "A ; # value=001"`, `ListPlayers`,
    `BanById TEST_PLAYER 100 "Reason"`, `Fatal error: [File:X:/Engine.cpp] [Line: 1]`,
    `command7`, `command8`, `command9`, `command10`, `newest`
  ]))
  controller.setActive(true)
  await setImmediate()
  controller.setActive(false)

  assert.equal(controller.state.total, 12)
  assert.deepEqual(controller.state.rows.map(row => row.command), [
    `ListPlayers`, `Serversay "A ; # value=001"`, `ListPlayers`, `BanById TEST_PLAYER 100 "Reason"`,
    `Fatal error: [File:X:/Engine.cpp] [Line: 1]`, `command7`, `command8`, `command9`, `command10`, `newest`
  ])
  assert.deepEqual(controller.state.rows[1], { index: 4, command: `Serversay "A ; # value=001"`, action: `Serversay`, info: `"A ; # value=001"` })
  assert.equal(controller.state.rows[9].index, 12)
  assert.equal(controller.state.rows[9].action, `newest`)
  assert.equal(controller.state.rows[9].info, ``)
})

test(`reads immediately and each second only while the tab is active`, async context => {
  context.mock.timers.enable({ apis: [`setInterval`] })
  let reads = 0
  const controller = new InputHistoryController(async () => config([`command${++reads}`]))
  context.mock.timers.tick(2000)
  assert.equal(reads, 0)
  controller.setActive(true)
  controller.setActive(true)
  await setImmediate()
  assert.equal(reads, 1)
  context.mock.timers.tick(999)
  assert.equal(reads, 1)
  context.mock.timers.tick(1)
  await setImmediate()
  assert.equal(reads, 2)
  assert.equal(controller.state.rows[0].command, `command2`)
  controller.setActive(false)
  context.mock.timers.tick(5000)
  assert.equal(reads, 2)
  controller.setActive(true)
  await setImmediate()
  controller.setActive(false)
  assert.equal(reads, 3)
})

test(`slow reads never overlap and a response after leaving the tab is ignored`, async context => {
  context.mock.timers.enable({ apis: [`setInterval`] })
  let finish!: (value: InputConfig) => void
  const pending = new Promise<InputConfig>(resolve => { finish = resolve })
  let reads = 0
  const controller = new InputHistoryController(async () => {
    reads += 1
    return reads === 1 ? await pending : config([`fresh`])
  })
  controller.setActive(true)
  context.mock.timers.tick(5000)
  assert.equal(reads, 1)
  controller.setActive(false)
  finish(config([`stale`]))
  await setImmediate()
  assert.equal(controller.state.rows.length, 0)
  controller.setActive(true)
  await setImmediate()
  controller.setActive(false)
  assert.equal(controller.state.rows[0].command, `fresh`)
})

test(`failed reads expose the error, retain the last snapshot, and recover on the next refresh`, async context => {
  context.mock.timers.enable({ apis: [`setInterval`] })
  let reads = 0
  const controller = new InputHistoryController(async () => {
    reads += 1
    if (reads === 2) throw new Error(`Input.ini was not found.`)
    return reads === 1 ? config([`ListPlayers`]) : { file: `Input.ini`, sections: {} }
  })
  controller.setActive(true)
  await setImmediate()
  context.mock.timers.tick(1000)
  await setImmediate()
  assert.equal(controller.state.error, `Input.ini was not found.`)
  assert.equal(controller.state.rows[0].command, `ListPlayers`)
  context.mock.timers.tick(1000)
  await setImmediate()
  controller.setActive(false)
  assert.equal(controller.state.error, ``)
  assert.equal(controller.state.total, 0)
  assert.deepEqual(controller.state.rows, [])
  assert.ok(controller.state.updatedAt)
})
