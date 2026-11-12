import assert from 'node:assert/strict'
import test from 'node:test'
import type { CoreAction } from '../../shared/coreAction'
import { ConsoleActionLayouts } from './consoleActionLayouts'

const action: CoreAction = { id: `one`, key: `one`, author: `user`, priority: `normal`, app: { processId: 1, windowHandle: `0x1` },
  commands: [{ type: `console`, command: `hello`, consoleKey: `F7`, keyboardLayoutId: `00000409`, delayMs: 12 }, { type: `keys`, presses: [{ virtualKey: 65, durationMs: 0 }] }] }
test(`all normal producers receive local selection without changing physical keys or caller data`, () => {
  for (const author of [`user`, `system`] as const) {
    const prepared = ConsoleActionLayouts.prepare({ ...action, author }, { layoutId: `00000414`, source: `manual` }, null)
    assert.deepEqual(prepared.commands[0], { ...action.commands[0], keyboardLayoutId: `00000414` })
    assert.deepEqual(prepared.commands[1], action.commands[1])
    assert.equal(action.commands[0].type === `console` && action.commands[0].keyboardLayoutId, `00000409`)
  }
})
test(`detect is retained only for the exact authorized probe`, () => {
  const probe = { ...action, commands: [{ type: `console`, command: `ListPlayers`, consoleKey: `F7`, expectClipboard: true, keyboardLayoutId: `detect` }] } as CoreAction
  assert.equal((ConsoleActionLayouts.prepare(probe, null, `one`).commands[0] as { keyboardLayoutId: string }).keyboardLayoutId, `detect`)
  assert.throws(() => ConsoleActionLayouts.prepare(probe, null, `another`))
  assert.throws(() => ConsoleActionLayouts.prepare(action, null, null))
})
