import assert from 'node:assert/strict'
import test from 'node:test'
import { get } from 'svelte/store'
import { createTeamMenuState } from './teamMenuState'

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
