import assert from 'node:assert/strict'
import test from 'node:test'
import { get } from 'svelte/store'
import type { TeamNavigationTarget } from '$lib/teams/teamNavigation'
import { createTeamMenuState, canAccessTeamMenuEntry, openTeamMenuEntry } from './teamMenuState'

const destinations = [{ target: `members` }, { target: `requests`, adminOnly: true }] as const

test(`superadmins can navigate to join requests with limited team permissions`, () => {
  for (const permissions of [[], [`read`], [`edit`]]) {
    assert.deepEqual(destinations.filter(entry => canAccessTeamMenuEntry(entry, { permissions }, true)).map(entry => entry.target), [`members`, `requests`])
  }
})

test(`ordinary members need team admin permission to navigate to join requests`, () => {
  for (const permissions of [[], [`read`], [`edit`], [`delete`]]) {
    assert.deepEqual(destinations.filter(entry => canAccessTeamMenuEntry(entry, { permissions }, false)).map(entry => entry.target), [`members`])
  }
  assert.deepEqual(destinations.filter(entry => canAccessTeamMenuEntry(entry, { permissions: [`admin`] }, false)).map(entry => entry.target), [`members`, `requests`])
})

test(`team admin destinations require a selected team`, () => {
  for (const isSuperadmin of [false, true]) {
    assert.deepEqual(destinations.filter(entry => canAccessTeamMenuEntry(entry, null, isSuperadmin)).map(entry => entry.target), [`members`])
  }
})

test(`a superadmin with read-only team permissions opens join requests for the selected team`, async () => {
  const opened: TeamNavigationTarget[] = []
  const team = { id: 3, name: `TJ`, ownerUserId: 1, permissions: [`read`] }
  assert.equal(await openTeamMenuEntry(destinations[1], team, true, async target => {
    opened.push(target)
    return true
  }), true)
  assert.deepEqual(opened, [{ page: `teams`, teamId: 3, teamView: `requests` }])
})

test(`unauthorized team request activation never navigates`, async () => {
  const opened: TeamNavigationTarget[] = []
  const team = { id: 3, name: `TJ`, ownerUserId: 1, permissions: [`read`] }
  for (const selected of [null, team, { ...team, isMember: false }]) {
    assert.equal(await openTeamMenuEntry(destinations[1], selected, false, async target => {
      opened.push(target)
      return true
    }), false)
  }
  assert.deepEqual(opened, [])
})

test(`team menu navigation preserves profile destinations and cancelled navigation`, async () => {
  const opened: TeamNavigationTarget[] = []
  const team = { id: 3, name: `TJ`, ownerUserId: 1, permissions: [`admin`] }
  assert.equal(await openTeamMenuEntry({ target: `profiles` }, team, false, async target => {
    opened.push(target)
    return false
  }), false)
  assert.deepEqual(opened, [{ page: `profiles`, teamId: 3 }])
})

test(`menu Back returns to main and allows reopening the team menu`, () => {
  const menu = createTeamMenuState()
  menu.openTeam()
  assert.equal(get(menu), `team`)
  menu.back()
  assert.equal(get(menu), `main`)
  menu.openTeam()
  menu.reset()
  assert.equal(get(menu), `main`)
})

test(`an explicit team selection reopens the menu after Back, including the same team`, () => {
  const menu = createTeamMenuState()
  menu.syncSelection(1, true)
  assert.equal(get(menu), `team`)
  menu.back()
  menu.syncSelection(1, true)
  assert.equal(get(menu), `main`)
  menu.syncSelection(2, true)
  assert.equal(get(menu), `team`)
})

test(`mounting with an existing selection and account resets leave the main menu open`, () => {
  const menu = createTeamMenuState(3)
  menu.syncSelection(3, true)
  assert.equal(get(menu), `main`)
  menu.syncSelection(4, false)
  assert.equal(get(menu), `main`)
  menu.syncSelection(0, true)
  assert.equal(get(menu), `main`)
})

test(`leaving team content returns the sidebar to main without reopening it on return`, () => {
  const menu = createTeamMenuState()
  menu.syncContent(3, 3)
  menu.openTeam()
  assert.equal(menu.syncContent(null, 3), true)
  assert.equal(get(menu), `main`)
  menu.syncContent(3, 3)
  assert.equal(get(menu), `main`)
})

test(`team subpages and cancelled navigation keep the current team menu`, () => {
  const menu = createTeamMenuState()
  menu.syncContent(3, 3)
  menu.openTeam()
  assert.equal(menu.syncContent(3, 3), false)
  assert.equal(get(menu), `team`)
})

test(`switching content keeps the matching team's menu and exits a mismatched one`, () => {
  const menu = createTeamMenuState()
  menu.syncContent(3, 3)
  menu.openTeam()
  assert.equal(menu.syncContent(7, 7), false)
  assert.equal(get(menu), `team`)
  assert.equal(menu.syncContent(3, 7), true)
  assert.equal(get(menu), `main`)
})
