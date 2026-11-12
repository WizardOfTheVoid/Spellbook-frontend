import assert from 'node:assert/strict'
import test from 'node:test'
import { ConsoleBindingProbe } from './consoleBindingProbe'

test(`explicit probe sends one independent ListPlayers request with a fixed id and detection`, async () => {
  let received: unknown
  const expected = { ok: true, status: 200, statusText: `OK`, data: null }
  const probe = new ConsoleBindingProbe({ executeAction: async (commands, options) => { received = { commands, options }; return expected } })
  const signal = new AbortController().signal
  assert.equal(await probe.run(`probe-1`, `Minus`, signal), expected)
  assert.deepEqual(received, { commands: [{ type: `console`, command: `ListPlayers`, consoleKey: `Minus`, expectClipboard: true, keyboardLayoutId: `detect` }],
    options: { id: `probe-1`, author: `user`, priority: `normal`, signal } })
})
