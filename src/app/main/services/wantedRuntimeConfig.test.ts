import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveWantedRuntimeConfig } from './wantedRuntimeConfig'

test('missing Wanted runtime settings use the approved defaults', () => {
  assert.deepEqual(resolveWantedRuntimeConfig({}), {
    listPlayersPollMs: 15_000,
    listPlayersSentinelPollMs: 5_000,
    wantedPollMs: 5_000,
    wantedSentinelPollMs: 2_000,
    messagePrefix: `[SB Wanted]`,
    mockMessage: `[Mock] "[user]" has been automatically community-[action] for: [type]`,
    actionMessage: `[user]" has been automatically community-[action] for: [type]`
  })
})

test('Wanted runtime settings convert seconds and preserve message bytes', () => {
  assert.deepEqual(resolveWantedRuntimeConfig({
    LISTPLAYERS_POLL_SECONDS: `21`,
    LISTPLAYERS_SENTINEL_POLL_SECONDS: `7`,
    WANTED_POLL_SECONDS: `8`,
    WANTED_SENTINEL_POLL_SECONDS: `4`,
    WANTED_MESSAGE_PREFIX: `  [Community]  `,
    WANTED_MOCK_MESSAGE: ` 'mock [user]' `,
    WANTED_ACTION_MESSAGE: `\t[action] [type] [reason]\t`
  }), {
    listPlayersPollMs: 21_000,
    listPlayersSentinelPollMs: 7_000,
    wantedPollMs: 8_000,
    wantedSentinelPollMs: 4_000,
    messagePrefix: `  [Community]  `,
    mockMessage: ` 'mock [user]' `,
    actionMessage: `\t[action] [type] [reason]\t`
  })
})

test('every cadence rejects non-positive, non-integer, and overflowing seconds', () => {
  const keys = [
    `LISTPLAYERS_POLL_SECONDS`,
    `LISTPLAYERS_SENTINEL_POLL_SECONDS`,
    `WANTED_POLL_SECONDS`,
    `WANTED_SENTINEL_POLL_SECONDS`
  ] as const

  for (const key of keys) {
    for (const value of [``, ` `, `0`, `-1`, `1.5`, `invalid`, `2147484`]) {
      assert.throws(
        () => resolveWantedRuntimeConfig({ [key]: value }),
        new RegExp(key, `u`)
      )
    }
  }
})
