import assert from 'node:assert/strict'
import test from 'node:test'
import { getTeamContentId, visitTeamTarget } from './teamNavigation'

test(`cancelled same-page navigation never changes its content target`, async () => {
  const opened: unknown[] = []
  assert.equal(await visitTeamTarget({ page: `profiles`, teamId: 3 }, {
    canLeave: async () => false, isCurrent: () => true,
    visit: async (action: () => Promise<boolean>) => action(),
    open: async (target: unknown) => { opened.push(target); return true }
  }), false)
  assert.deepEqual(opened, [])
})

test(`an accepted destination captures its team before asynchronous navigation`, async () => {
  let target = { page: `teams` as const, teamId: 7, teamView: `guidelines` as const }
  const opened: unknown[] = []
  assert.equal(await visitTeamTarget(target, {
    canLeave: async () => { target.teamId = 3; return true }, isCurrent: () => true,
    visit: async action => action(), open: async value => { opened.push(value); return true }
  }), true)
  assert.deepEqual(opened, [{ page: `teams`, teamId: 7, teamView: `guidelines` }])
})

test(`a session change while confirming discard prevents navigation`, async () => {
  let current = true
  let opened = false
  assert.equal(await visitTeamTarget({ page: `teams`, teamId: null }, {
    canLeave: async () => { current = false; return true }, isCurrent: () => current,
    visit: async action => action(), open: async () => { opened = true; return true }
  }), false)
  assert.equal(opened, false)
})

test(`team content includes team profiles and pending handoffs but excludes global pages and the team list`, () => {
  const location = { teamId: 3, teamView: `guidelines` as const }
  assert.equal(getTeamContentId(`teams`, null, location, null), 3)
  assert.equal(getTeamContentId(`profiles`, { type: `team`, id: 3 }, location, null), 3)
  assert.equal(getTeamContentId(`profiles`, { type: `user`, id: 1 }, location, null), null)
  assert.equal(getTeamContentId(`settings`, null, location, null), null)
  assert.equal(getTeamContentId(`server`, { type: `team`, id: 3 }, location, null), null)
  assert.equal(getTeamContentId(`teams`, null, { ...location, teamId: null }, { teamId: 3 }), 3)
  assert.equal(getTeamContentId(`teams`, null, location, { teamId: null }), null)
  assert.equal(getTeamContentId(`teams`, null, { ...location, teamId: null }, null), null)
})
