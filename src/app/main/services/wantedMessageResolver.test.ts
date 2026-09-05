import assert from 'node:assert/strict'
import test from 'node:test'
import type { WantedRuntimeConfig } from './wantedRuntimeConfig'
import {
  WantedMessageResolver,
  type ResolvedWantedMessages
} from './wantedMessageResolver'
import type {
  WantedMessageContext,
  WantedWork
} from './wantedWorkClient'

const context: WantedMessageContext = {
  admin: `Admin`,
  serverName: `Duel Server`,
  clanName: `Super Clan`,
  clanTag: `SB`,
  variables: [
    { key: `action`, value: `wrong` },
    { key: `type`, value: `wrong` },
    { key: `rules`, value: `[admin] rules` },
    { key: `adminsay_prefix`, value: `[Server Admin]` }
  ]
}

const config: WantedRuntimeConfig = {
  listPlayersPollMs: 20_000,
  listPlayersSentinelPollMs: 5_000,
  wantedPollMs: 6_000,
  wantedSentinelPollMs: 3_000,
  messagePrefix: `  [SB Wanted] [clan_tag]  `,
  mockMessage: `  [Wanted Mock] [user] [action] [rules]  `,
  actionMessage: `  "[user]" has been community-[action] for [type] [rules]  `
}

test(`resolves a ban with the exact player name and one Wanted prefix`, () => {
  const resolved = resolve(work({
    actionType: `ban`,
    duration: null,
    sourceReason: `[admin] banned [user] for [type] ([duration])`
  }), `Player [admin]`)

  assert.deepEqual(resolved, {
    automaticReason: `[SB Wanted] SB Admin banned Player [admin] for Cheating (MAX)`,
    banAnnouncement: `[SB Wanted] SB "Player [admin]" has been community-banned for Cheating [admin] rules`
  })
})

test(`forwards a manual community-ban reason without prefixing or templating it again`, () => {
  const resolved = resolve(work({
    creationType: `manual`,
    sourceReason: `"Stored [user]" has been community-banned for Cheating`
  }), `Different live name`)

  assert.equal(resolved.automaticReason, `"Stored [user]" has been community-banned for Cheating`)
})

test(`mock uses one identical validated message for Core and completion`, () => {
  const resolved = resolve(work({ actionType: `mock`, duration: null, sourceReason: null }), `Mock Player`)

  assert.deepEqual(resolved, {
    automaticReason: `[SB Wanted] SB [Wanted Mock] Mock Player mocked [admin] rules`,
    mockAdminsay: `[SB Wanted] SB [Wanted Mock] Mock Player mocked [admin] rules`
  })
})

test(`presence-free unban falls back to PlayFab and persists the action message`, () => {
  const resolved = resolve(work({
    actionType: `unban`,
    offenseType: null,
    duration: null,
    sourceReason: null
  }))

  assert.deepEqual(resolved, {
    automaticReason: `[SB Wanted] SB "PLAYER_1" has been community-unbanned for Cheating [admin] rules`
  })
})

test(`automatic reasons are bounded after resolution and remain nonblank`, () => {
  const longResolver = new WantedMessageResolver({
    ...config,
    messagePrefix: `Prefix`,
    actionMessage: `Action`
  })
  const resolved = longResolver.resolve(work({ sourceReason: `x`.repeat(300) }), context, `Player`)

  assert.equal(resolved.automaticReason, `Prefix ${`x`.repeat(173)}`)
  assert.equal(resolved.automaticReason.length, 180)

  assert.throws(() => new WantedMessageResolver({
    ...config,
    messagePrefix: ` `,
    actionMessage: ` `
  }).resolve(work({ actionType: `unban`, offenseType: null }), context), /message.*blank/iu)
})

test(`a long mock sends and persists one byte-identical bounded message`, () => {
  const resolved = new WantedMessageResolver({
    ...config,
    messagePrefix: `Prefix`,
    mockMessage: `x`.repeat(300)
  }).resolve(work({ actionType: `mock`, sourceReason: null }), context, `Player`)

  assert.equal(resolved.automaticReason.length, 180)
  assert.equal(resolved.mockAdminsay, resolved.automaticReason)
})

test(`validates mock and ban announcement output before a claim`, () => {
  assert.throws(() => new WantedMessageResolver({
    ...config,
    messagePrefix: ` `,
    mockMessage: ` `
  }).resolve(work({ actionType: `mock`, sourceReason: null }), context, `Player`), /message.*blank/iu)

  assert.throws(() => new WantedMessageResolver({
    ...config,
    messagePrefix: ` `,
    actionMessage: ` `
  }).resolve(work(), context, `Player`), /message.*blank/iu)
})

function resolve(item: WantedWork, playerName?: string): ResolvedWantedMessages {
  return new WantedMessageResolver(config).resolve(item, context, playerName)
}

function work(overrides: Partial<WantedWork> = {}): WantedWork {
  return {
    wantedId: 1,
    sourceActionId: 2,
    targetServerId: 3,
    playfabId: `PLAYER_1`,
    actionType: `ban`,
    offenseType: `hacker`,
    duration: 24,
    sourceReason: `Cheating`,
    creationType: `auto`,
    cycleRevision: 0,
    attemptNumber: 1,
    announce: true,
    ...overrides
  }
}
