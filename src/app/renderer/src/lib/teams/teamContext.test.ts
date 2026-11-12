import assert from 'node:assert/strict'
import test from 'node:test'
import { get } from 'svelte/store'
import type { ActiveServerProfile, CoreCallResult, CurrentGameSnapshot, TeamListRecord } from '$lib/core'
import { createCurrentServerStore } from '$lib/gameState/currentServerState'
import { rosterFixture } from '$lib/serverStore/serverStoreFixtures'
import { createTeamEditor } from '$lib/components/account/teams/teamEditor'
import { createCurrentTeamStore } from './currentTeamStore'
import { visitTeamTarget } from './teamNavigation'

test(`TT navigation and guideline saves preserve the connected DR3 profile and variables`, async t => {
  const response = (data: unknown) => ({ ok: true, status: 200, data }) as CoreCallResult
  const profile = { ownerTeamId: 3, variables: [{ key: `rules`, value: `DR3` }], canExecuteActions: true } as ActiveServerProfile
  const snapshot: CurrentGameSnapshot = { version: 1, observedAt: new Date().toISOString(), gameServerId: 3, externalId: `dr3`, serverName: `DR3`, serverAddress: null, players: [], parseWarnings: [] }
  let profileCalls = 0
  const server = createCurrentServerStore({
    api: () => ({ currentGameSnapshot: async () => snapshot, onCurrentGameSnapshot: () => () => {} }),
    loadRoster: async () => rosterFixture(), loadProfile: async () => { profileCalls++; return profile }
  })
  t.after(() => server.sync(null))
  server.sync(1)
  const teams = createCurrentTeamStore({ loadTeams: async () => [3, 7].map(id => ({ id, name: String(id), permissions: [`admin`], ownerUserId: 1, memberCount: 1, profileCount: 1, claimedServerCount: 1 }) as TeamListRecord), storage: () => ({ getItem: () => null, setItem: () => {}, removeItem: () => {} }) })
  teams.syncUser(1)
  await teams.refresh()
  teams.observeServer({ connectionKey: `dr3`, ownerTeamId: 3, ownershipResolved: true })
  teams.select(7)
  const writes: { teamId: number, content: string }[] = []
  await visitTeamTarget({ page: `teams`, teamId: 7, teamView: `guidelines` }, {
    canLeave: async () => true, isCurrent: () => true, visit: async action => action(),
    open: async destination => {
      assert.equal(destination.teamId, 7)
      const teamId = destination.teamId!
      const editor = createTeamEditor<{ content: string }>(async () => response({ content: `TT` }), async value => {
        writes.push({ teamId, content: value.content })
        return response(value)
      })
      await editor.load()
      editor.change({ content: `Updated TT guidelines` })
      teams.select(3)
      return editor.save()
    }
  })
  assert.deepEqual(writes, [{ teamId: 7, content: `Updated TT guidelines` }])
  assert.equal(get(server).snapshot?.externalId, `dr3`)
  assert.equal(get(server).activeProfile, profile)
  assert.deepEqual(get(server).activeProfile?.variables, [{ key: `rules`, value: `DR3` }])
  assert.equal(profileCalls, 1)
})
