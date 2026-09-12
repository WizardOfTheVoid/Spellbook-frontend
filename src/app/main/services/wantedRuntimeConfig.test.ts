import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveWantedRuntimeConfig } from './wantedRuntimeConfig'

test('missing Wanted runtime settings use the approved defaults', () => {
  assert.deepEqual(resolveWantedRuntimeConfig({}), {
    messagePrefix: `[SB Wanted]`,
    mockMessage: `[Mock] "[user]" has been automatically community-[action] for: [type]`,
    actionMessage: `[user]" has been automatically community-[action] for: [type]`
  })
})

test('Wanted runtime settings preserve message bytes', () => {
  assert.deepEqual(resolveWantedRuntimeConfig({
    WANTED_MESSAGE_PREFIX: `  [Community]  `,
    WANTED_MOCK_MESSAGE: ` 'mock [user]' `,
    WANTED_ACTION_MESSAGE: `\t[action] [type] [reason]\t`
  }), {
    messagePrefix: `  [Community]  `,
    mockMessage: ` 'mock [user]' `,
    actionMessage: `\t[action] [type] [reason]\t`
  })
})
