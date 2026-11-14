import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveAntiAfkConfig } from './antiAfkConfig'

test('missing Anti-AFK environment values use safe defaults', () => {
  assert.deepEqual(resolveAntiAfkConfig({}), {
    intervalMs: 60_000,
    minimumMovementIdleMs: 120_000,
    presses: [
      { virtualKey: 0x57, durationMs: 20 },
      { virtualKey: 0x53, durationMs: 20 }
    ]
  })
})

test('ordered KEY:DURATION_MS entries become Core input settings', () => {
  assert.deepEqual(resolveAntiAfkConfig({
    ANTI_AFK_INTERVAL_SECONDS: '45',
    ANTI_AFK_MINIMUM_IDLE_MINUTES: '3',
    ANTI_AFK_KEYS: 'W:20, S:25, Enter:50'
  }), {
    intervalMs: 45_000,
    minimumMovementIdleMs: 180_000,
    presses: [
      { virtualKey: 0x57, durationMs: 20 },
      { virtualKey: 0x53, durationMs: 25 },
      { virtualKey: 0x0d, durationMs: 50 }
    ]
  })
})

test('common readable key names translate to Windows virtual keys', () => {
  const cases: Array<[string, number]> = [
    ['A', 0x41],
    ['7', 0x37],
    ['ENTER', 0x0d],
    ['LEFT', 0x25],
    ['F12', 0x7b]
  ]

  for (const [keyName, virtualKey] of cases) {
    assert.equal(
      resolveAntiAfkConfig({ ANTI_AFK_KEYS: `${keyName}:0` }).presses[0].virtualKey,
      virtualKey
    )
  }
})

test('invalid Anti-AFK environment values identify the rejected setting', () => {
  const cases: Array<[NodeJS.ProcessEnv, RegExp]> = [
    [{ ANTI_AFK_INTERVAL_SECONDS: '0' }, /ANTI_AFK_INTERVAL_SECONDS/u],
    [{ ANTI_AFK_INTERVAL_SECONDS: '1.5' }, /ANTI_AFK_INTERVAL_SECONDS/u],
    [{ ANTI_AFK_MINIMUM_IDLE_MINUTES: '0' }, /ANTI_AFK_MINIMUM_IDLE_MINUTES/u],
    [{ ANTI_AFK_MINIMUM_IDLE_MINUTES: '1.5' }, /ANTI_AFK_MINIMUM_IDLE_MINUTES/u],
    [{ ANTI_AFK_KEYS: 'JUMP:20' }, /ANTI_AFK_KEYS/u],
    [{ ANTI_AFK_KEYS: 'W' }, /ANTI_AFK_KEYS/u],
    [{ ANTI_AFK_KEYS: 'W:-1' }, /ANTI_AFK_KEYS/u],
    [{ ANTI_AFK_KEYS: 'W:60001' }, /ANTI_AFK_KEYS/u],
    [{ ANTI_AFK_KEYS: 'W:20,,S:20' }, /ANTI_AFK_KEYS/u]
  ]

  for (const [env, expectedError] of cases) {
    assert.throws(() => resolveAntiAfkConfig(env), expectedError)
  }
})
