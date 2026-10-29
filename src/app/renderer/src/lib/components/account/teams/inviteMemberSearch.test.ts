import assert from 'node:assert/strict'
import test from 'node:test'
import type { TeamMemberRecord } from '../../../core'

test(`invite search matches display names, Discord handles and PlayFab IDs`, async () => {
  const module = await import(`./inviteMemberSearch`).catch(() => ({}))
  const filter = Reflect.get(module, `filterInviteCandidates`)
  assert.equal(typeof filter, `function`)
  const candidates = [{ userId: 1, displayName: `Jonas`, username: `wizard`, playfabId: `ABC123` },
    { userId: 2, displayName: `Other`, username: `someone`, playfabId: null }] as TeamMemberRecord[]
  for (const search of [` JON `, `@WIZARD`, `wizard`, `abc123`]) assert.deepEqual(filter(candidates, search).map((user: TeamMemberRecord) => user.userId), [1])
  assert.deepEqual(filter(candidates, `unmatched`), [])
  assert.equal(filter(candidates, ` `).length, 2)
})
