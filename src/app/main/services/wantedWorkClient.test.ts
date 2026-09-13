import assert from 'node:assert/strict'
import test from 'node:test'
import type { HttpClient } from '../api/http-client'
import type { CoreCallResult } from '../types'
import {
  WantedWorkClient,
  type WantedClaim,
  type WantedWork
} from './wantedWorkClient'

const token = `123e4567-e89b-12d3-a456-426614174000`
const item: WantedWork = {
  wantedId: 7,
  sourceActionId: 41,
  targetServerId: 13,
  playfabId: `PLAYER_1`,
  actionType: `ban`,
  offenseType: `hacker`,
  duration: null,
  sourceReason: `Cheating`,
  creationType: `auto`,
  cycleRevision: 6,
  attemptNumber: 2,
  announce: false
}
const claim: WantedClaim = {
  id: 9,
  wantedId: 7,
  sourceActionId: 41,
  gameServerId: 13,
  token
}
const snapshot = {
  version: 4,
  observedAt: `2026-09-01T00:00:00.000Z`,
  gameServerId: 13,
  players: [{ playfabId: `PLAYER_1` }]
}

test(`lists work through the exact authenticated endpoint and validates the page`, async () => {
  const calls: unknown[] = []
  const client = createClient(async (path, body) => {
    calls.push([path, body])
    return success({
      work: [item],
      messageContext: {
        admin: `Admin`,
        serverName: `Duel`,
        clanName: `Clan`,
        clanTag: `SB`,
        variables: [{ key: `rules`, value: `Rules` }]
      }
    })
  })

  assert.deepEqual(await client.listWork(snapshot), {
    work: [item],
    messageContext: {
      admin: `Admin`,
      serverName: `Duel`,
      clanName: `Clan`,
      clanTag: `SB`,
      variables: [{ key: `rules`, value: `Rules` }]
    }
  })
  assert.deepEqual(calls, [[`/wanted/work`, {
    gameServerId: 13,
    playfabIds: [`PLAYER_1`],
    snapshotVersion: 4,
    observedAt: `2026-09-01T00:00:00.000Z`
  }]])
})

test(`claims immediately for one work item and validates all correlations`, async () => {
  const calls: unknown[] = []
  const client = createClient(async (path, body) => {
    calls.push([path, body])
    return success({ ...claim, userId: 3, expiresAt: `2026-08-31T12:00:00.000Z` })
  })

  assert.deepEqual(await client.claim(item, 13), claim)
  assert.deepEqual(calls, [[`/wanted/claims`, {
    wantedId: 7,
    sourceActionId: 41,
    gameServerId: 13,
    cycleRevision: 6,
    attemptNumber: 2
  }]])
})

test(`preserves null claim contention without treating it as an error`, async () => {
  const client = createClient(async () => success(null))
  assert.equal(await client.claim(item, 13), null)
})

test(`never trusts malformed or mismatched work and claim envelopes`, async () => {
  for (const data of [
    null,
    { work: [{ ...item, wantedId: 0 }], messageContext: messageContext() },
    { work: [{ ...item, actionType: `kick` }], messageContext: messageContext() },
    { work: [item], messageContext: { ...messageContext(), variables: [{ key: 1, value: `x` }] } }
  ]) {
    await assert.rejects(createClient(async () => success(data)).listWork(snapshot), /malformed/iu)
  }

  for (const data of [
    { ...claim, id: 0 },
    { ...claim, token: token.toUpperCase() },
    { ...claim, wantedId: 8 },
    { ...claim, sourceActionId: 42 },
    { ...claim, gameServerId: 14 }
  ]) {
    await assert.rejects(createClient(async () => success(data)).claim(item, 13), /malformed|mismatch/iu)
  }
})

test(`rejects HTTP, auth, and malformed success responses`, async () => {
  await assert.rejects(createClient(async () => ({
    ok: false,
    status: 401,
    statusText: `Unauthorized`,
    data: { ok: false, error: { code: `UNAUTHORIZED`, message: `Expired` } }
  })).listWork(snapshot), (error: unknown) => error instanceof Error
    && error.message === `Expired`
    && `status` in error
    && error.status === 401)

  await assert.rejects(createClient(async () => ({
    ok: true,
    status: 200,
    statusText: `OK`,
    data: { work: [], messageContext: messageContext() }
  })).listWork(snapshot), /malformed/iu)
})

test(`records attempts, completes, and fails claims with exact paths and bounded optional details`, async () => {
  const calls: unknown[] = []
  const client = createClient(async (path, body) => {
    calls.push([path, body])
    return path.endsWith(`/fail`) || path.endsWith(`/attempt`)
      ? { ok: true, status: 204, statusText: `No Content`, data: null }
      : success({ id: 44 })
  })

  await client.recordAttempt(claim, item, `[SB] Submitted`)
  await client.complete(claim, `[SB] Cheating`)
  await client.fail(claim, { code: `CORE_FAILED`, message: `Core rejected input` })
  await client.fail(claim)

  assert.deepEqual(calls, [
    [`/wanted/claims/9/attempt`, { token, cycleRevision: 6, automaticReason: `[SB] Submitted` }],
    [`/wanted/claims/9/complete`, { token, automaticReason: `[SB] Cheating` }],
    [`/wanted/claims/9/fail`, { token, code: `CORE_FAILED`, message: `Core rejected input` }],
    [`/wanted/claims/9/fail`, { token }]
  ])
})

function createClient(
  postServer: (path: string, body: unknown) => Promise<CoreCallResult>
): WantedWorkClient {
  return new WantedWorkClient({ postServer } as Pick<HttpClient, `postServer`>)
}

function success(data: unknown): CoreCallResult {
  return {
    ok: true,
    status: 200,
    statusText: `OK`,
    data: { ok: true, requestId: `request`, data }
  }
}

function messageContext() {
  return { admin: `Admin`, serverName: `Duel`, clanName: `Clan`, clanTag: `SB`, variables: [] }
}
