import assert from 'node:assert/strict'
import test from 'node:test'
import { createDebugLayout, createDebugPresets, validateDebugLayout, validateDebugPreset } from '../../shared/debugPresets'
import { DebugConfiguration } from './debugConfiguration'

test(`adding the ruleset panel preserves saved positions and visibility of existing panels`, async () => {
  const { ruleset, ...layout } = createDebugLayout()
  layout.tests.x = 0.3
  layout.events.visible = false
  const configuration = new DebugConfiguration({ getConsoleKey: () => `F6`, loadConfig: () => ({ version: 2, presets: [], layout }) })
  await configuration.initialize()
  assert.deepEqual(configuration.layout, { ...layout, ruleset })
})

test(`legacy presets retain ListPlayers and move ServerSay from 5 to 2 without reviving N tests`, async () => {
  const defaults = createDebugPresets(`F6`)
  const layout = createDebugLayout()
  layout.tests.x = 0.25
  let saved: unknown
  const configuration = new DebugConfiguration({ getConsoleKey: () => `F6`,
    loadConfig: () => ({ layout, presets: [defaults[0],
      { ...defaults[0], slot: 2, commands: [{ type: `keys`, presses: [{ virtualKey: 78, durationMs: 60 }] }] },
      { ...defaults[1], slot: 5, intervalMs: 300 }] }), saveConfig: config => { saved = config } })
  await configuration.initialize()
  assert.deepEqual(configuration.presets().map(preset => preset.slot), [1, 2, 3, 4, 5, 6])
  assert.deepEqual(configuration.presets()[1]?.commands, defaults[1]?.commands)
  assert.equal(configuration.presets()[1]?.intervalMs, 300)
  assert.equal(configuration.layout.tests.x, 0.25)
  await configuration.configure(layout)
  const restored = new DebugConfiguration({ getConsoleKey: () => `F6`, loadConfig: () => saved })
  await restored.initialize()
  assert.deepEqual(restored.presets(), configuration.presets())
})

test(`default tests preserve their safe command and priority contracts`, () => {
  const presets = createDebugPresets(`F6`)
  assert.deepEqual(presets.map(preset => preset.slot), [1, 2, 3, 4, 5, 6])
  assert.deepEqual(presets[0]?.commands, [{ type: `console`, command: `ListPlayers`, consoleKey: `F6`, expectClipboard: true, restoreClipboard: true }])
  assert.equal(presets[0]?.priority, `low`)
  assert.deepEqual(presets[1]?.commands, [{ type: `console`, command: `ServerSay "Dev test - 250ms - #[N]"`, consoleKey: `F6`, restoreClipboard: true }])
  assert.equal(presets[1]?.priority, `normal`)
  assert.equal(presets[1]?.repeat, `infinite`)
  for (const preset of presets) {
    assert.doesNotThrow(() => validateDebugPreset(preset))
    for (const command of preset.commands) if (command.type === `console`) assert.doesNotMatch(command.command, /ban|kick/iu)
  }
})

test(`Critical mock announces before ListPlayers after four seconds and survives saved configuration`, async () => {
  const preset = createDebugPresets(`F6`).find(preset => preset.slot === 5)!
  assert.ok(preset)
  assert.equal(preset.author, `system`)
  assert.equal(preset.priority, `critical`)
  assert.equal(preset.startDelayMs, 4000)
  assert.equal(preset.repeat, 1)
  assert.equal(preset.commands.length, 2)
  const announcement = preset.commands[0]
  assert.ok(announcement?.type === `console`)
  assert.match(announcement.command, /^ServerSay ".+"$/u)
  assert.equal(announcement.consoleKey, `F6`)
  assert.deepEqual(preset.commands[1], { type: `console`, command: `ListPlayers`, consoleKey: `F6`, expectClipboard: true, restoreClipboard: true })
  const configuration = new DebugConfiguration({ getConsoleKey: () => `F6`, loadConfig: () => ({ version: 2, presets: [preset], layout: createDebugLayout() }) })
  await configuration.initialize()
  assert.deepEqual(configuration.presets().find(value => value.slot === 5), preset)
})

test(`Critical timed mock starts immediately and delays only its ending message by two seconds`, () => {
  const preset = createDebugPresets(`F6`).find(preset => preset.slot === 6)!
  assert.ok(preset)
  assert.equal(preset.priority, `critical`)
  assert.equal(preset.author, `system`)
  assert.equal(preset.startDelayMs, 0)
  assert.equal(preset.repeat, 1)
  assert.deepEqual(preset.commands, [
    { type: `console`, command: `ServerSay "starting critical"`, consoleKey: `F6`, restoreClipboard: true },
    { type: `console`, command: `ServerSay "ending critical"`, consoleKey: `F6`, restoreClipboard: true, delayMs: 2000 }
  ])
})

test(`custom preset validation allows moderation commands but rejects malformed commands and unbounded repeats`, () => {
  const preset = createDebugPresets()[0]!
  const custom = { ...preset, commands: [{ type: `console`, command: `KickById PLAYER_1 "reason"`, consoleKey: `F6` }], token: `secret` }
  assert.equal(validateDebugPreset(custom).commands[0]?.type, `console`)
  assert.equal(`token` in validateDebugPreset(custom), false)
  for (const invalid of [
    { slot: 9 }, { repeat: 0 }, { repeat: 101 }, { intervalMs: -1 }, { startDelayMs: 600001 },
    { commands: [] }, { author: `unknown` }, { identity: `same` },
    { commands: [{ type: `keys`, presses: [{ virtualKey: 0, durationMs: 10 }] }] },
    { commands: [{ type: `keys`, presses: [{ virtualKey: 78, durationMs: 60001 }] }] },
    { commands: [{ type: `console`, command: `a\nb`, consoleKey: `F6` }] }
  ]) assert.throws(() => validateDebugPreset({ ...preset, ...invalid }), RangeError)
})

test(`layout validation keeps independent fresh defaults and bounded normalized positions`, () => {
  const layout = createDebugLayout()
  layout.tests.x = 0.2
  assert.notEqual(createDebugLayout().tests.x, 0.2)
  assert.equal(validateDebugLayout(layout).tests.x, 0.2)
  assert.throws(() => validateDebugLayout({ ...layout, tests: { ...layout.tests, x: 2 } }), RangeError)
  assert.throws(() => validateDebugLayout({ ...layout, tests: { ...layout.tests, opacity: NaN } }), RangeError)
})
