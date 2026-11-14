import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { DebugPreset } from '../../../../../shared/debug'
import { importPreset, moveCommand } from './debugEditor'

const preset: DebugPreset = {
  slot: 2, label: `N`, instruction: `Press N`, author: `user`, priority: `normal`,
  commands: [{ type: `keys`, presses: [{ virtualKey: 78, durationMs: 50 }] }],
  repeat: 1, intervalMs: 100, startDelayMs: 0, identity: `distinct`
}

test(`imports Action commands into the selected slot without importing runtime identity`, () => {
  const command = { type: `console`, command: `ListPlayers`, consoleKey: `NumpadSubtract`, delayMs: 200, expectClipboard: true, restoreClipboard: true }
  const result = importPreset(JSON.stringify({ id: `old`, key: `old`, app: { processId: 1 }, slot: 7, priority: `low`, commands: [command] }), preset)
  assert.equal(result.slot, 2)
  assert.equal(result.priority, `low`)
  assert.equal(result.repeat, 1)
  assert.deepEqual(result.commands, [command])
  assert.equal(`app` in result, false)
  assert.equal(`id` in result, false)
})

test(`imports repeat configuration and caller text without mutating the original preset`, () => {
  const result = importPreset(JSON.stringify({ ...preset, label: `My test`, repeat: 3, startDelayMs: 1000, identity: `matching` }), preset)
  assert.equal(result.label, `My test`)
  assert.equal(result.repeat, 3)
  assert.equal(result.identity, `matching`)
  result.commands[0].delayMs = 900
  assert.equal(preset.commands[0].delayMs, undefined)
})

test(`rejects JSON without an Action command collection`, () => {
  for (const text of [`null`, `[]`, `{}`, `{ "commands": "no" }`]) {
    assert.throws(() => importPreset(text, preset), /commands/)
  }
})

test(`reorders Commands without losing command data or changing the source`, () => {
  const first = preset.commands[0]
  const second = { type: `console` as const, command: `ListPlayers`, consoleKey: `NumpadSubtract` as const }
  const commands = [first, second]
  assert.deepEqual(moveCommand(commands, 0, 1), [second, first])
  assert.deepEqual(commands, [first, second])
  assert.deepEqual(moveCommand(commands, 0, -1), commands)
  assert.deepEqual(moveCommand(commands, 1, 1), commands)
})
