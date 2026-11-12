import assert from 'node:assert/strict'
import test from 'node:test'
import { actionEventsAdmins, actionEventsTeamIds, createActionEventsQuery, matchesActionEvent, setActionEventsTeams,
  actionEventsDateBounds, actionEventsDatePresets, actionEventsAdvancedCount, hasActionEventsFilters,
  scopeActionEventsCatalog, setActionEventsSource, setActionEventsSystem, setActionEventsAdmins, normalizeActionEventsQuery,
  selectActionEventsTeams } from './actionEventsQuery'
import type { ActionEvent, ActionEventsCatalog } from './actionEventsTypes'

const catalog: ActionEventsCatalog = {
  servers: [{ id: 5, name: `Duel` }],
  teams: [{ id: 1, name: `One`, isMine: true }, { id: 2, name: `Two`, isMine: false }],
  admins: [
    { id: 10, name: `Alice`, teamIds: [1, 2] },
    { id: 20, name: `Bob`, teamIds: [2] }
  ]
}
const now = Date.parse(`2026-10-23T12:00:00Z`)
const event: ActionEvent = {
  id: 50, admin: catalog.admins[0], ruleset: null, action: { label: `Ban`, iconKey: `ban`, commands: [{ commandType: `ban` }] },
  target: { type: `player`, player: { id: 99, name: `Target`, playfabId: `ABC123`, canOpen: false } },
  team: catalog.teams[0], server: { id: 5, name: `Duel`, canOpen: false }, origin: `discord`, execution: `manual`,
  status: `pending`, requestedAt: `2026-10-23T11:00:00Z`, completedAt: null, reason: `Repeated griefing`, canCancel: true
}

test(`human actions are the default and System is independent of missing author and app source`, () => {
  const defaults = createActionEventsQuery()
  const automatic: ActionEvent = { ...event, admin: null, origin: `spellbook`, execution: `automatic` }
  assert.equal(matchesActionEvent(automatic, defaults, catalog), false)
  assert.equal(matchesActionEvent(event, { ...defaults, systemOnly: true }, catalog), false)
  assert.equal(matchesActionEvent(automatic, { ...defaults, systemOnly: true }, catalog), true)
  assert.equal(matchesActionEvent({ ...event, admin: null }, defaults, catalog), true)
  assert.equal(matchesActionEvent(automatic, { ...defaults, sources: [`discord`] }, catalog), false)
  assert.equal(matchesActionEvent(event, { ...defaults, servers: [99] }, catalog), false)
  assert.equal(matchesActionEvent(event, { ...defaults, actionTypes: [`kick`] }, catalog), false)
  assert.equal(matchesActionEvent(event, { ...defaults, actionTypes: [`ban`], sources: [`discord`], servers: [5] }, catalog), true)
  const next = setActionEventsTeams({ ...defaults, servers: [5], systemOnly: true }, { mode: `selected`, ids: [2] }, catalog)
  assert.deepEqual(next.servers, [5])
  assert.equal(next.systemOnly, true)
})

test(`source matches the app used by a human admin without selecting the automated author`, () => {
  const app = { ...event, origin: `spellbook` as const }
  const sources = createActionEventsQuery({ sources: [`spellbook`] })
  assert.equal(sources.systemOnly, false)
  assert.equal(matchesActionEvent(app, sources, catalog), true)
  assert.equal(matchesActionEvent(event, sources, catalog), false)
  assert.equal(matchesActionEvent(event, { ...sources, sources: [`discord`] }, catalog), true)
  assert.equal(matchesActionEvent(app, { ...sources, admins: [10] }, catalog), true)
  assert.equal(matchesActionEvent(event, { ...sources, admins: [10], sources: [`discord`] }, catalog), true)
})

test(`calendar date bounds include the selected whole days and All time is unbounded`, () => {
  const previousTimezone = process.env.TZ
  process.env.TZ = `Europe/Oslo`
  try {
    for (const [date, hours] of [[new Date(2026, 2, 29, 12), 23], [new Date(2026, 9, 25, 12), 25]] as const) {
      const bounds = actionEventsDateBounds(date, date)
      assert.equal(bounds.until! - bounds.since!, hours * 3600000)
      assert.equal(new Date(bounds.since!).getHours(), 0)
      assert.equal(new Date(bounds.until!).getDate(), date.getDate() + 1)
    }
    const bounds = actionEventsDateBounds(new Date(2026, 9, 23), new Date(2026, 9, 23))
    const query = { ...createActionEventsQuery(), ...bounds }
    assert.equal(matchesActionEvent({ ...event, requestedAt: new Date(bounds.since!).toISOString() }, query, catalog), true)
    assert.equal(matchesActionEvent({ ...event, requestedAt: new Date(bounds.until! - 1).toISOString() }, query, catalog), true)
    assert.equal(matchesActionEvent({ ...event, requestedAt: new Date(bounds.until!).toISOString() }, query, catalog), false)
    assert.deepEqual(actionEventsDateBounds(null, null), { since: null, until: null })
    assert.equal(createActionEventsQuery().since, null)
    assert.equal(createActionEventsQuery().until, null)
    const presets = actionEventsDatePresets(new Date(2026, 9, 23))
    assert.deepEqual(presets.map(preset => preset.label), [`Today`, `Last 7 days`, `Last 30 days`, `All time`])
    const lastWeek = actionEventsDateBounds(presets[1].start, presets[1].end)
    assert.equal(new Date(lastWeek.since!).getDate(), 17)
    assert.equal(new Date(lastWeek.until!).getDate(), 24)
  } finally {
    if (previousTimezone === undefined) delete process.env.TZ
    else process.env.TZ = previousTimezone
  }
})

test(`an empty explicit team selection and an empty My teams scope never expand to All`, () => {
  assert.deepEqual(actionEventsTeamIds({ mode: `selected`, ids: [] }, catalog), [])
  assert.deepEqual(actionEventsTeamIds({ mode: `mine`, ids: [] }, { ...catalog, teams: [] }), [])
  assert.equal(matchesActionEvent(event, { ...createActionEventsQuery(), teams: { mode: `selected`, ids: [] } }, catalog), false)
})

test(`changing team scope keeps only selected admins who belong to the resulting teams`, () => {
  const query = { ...createActionEventsQuery(), admins: [10, 20] }
  assert.deepEqual(setActionEventsTeams(query, { mode: `mine`, ids: [] }, catalog).admins, [10])
  assert.deepEqual(setActionEventsTeams(query, { mode: `selected`, ids: [2] }, catalog).admins, [10, 20])
})

test(`deselecting the last individual team restores All teams without changing other filters`, () => {
  const selected = selectActionEventsTeams(createActionEventsQuery({ sources: [`discord`], servers: [5] }), [1], catalog)
  assert.deepEqual(selected.teams, { mode: `selected`, ids: [1] })
  const cleared = selectActionEventsTeams(selected, [], catalog)
  assert.deepEqual(cleared.teams, { mode: `all`, ids: [] })
  assert.deepEqual(cleared.sources, [`discord`])
  assert.deepEqual(cleared.servers, [5])
})

test(`All admins includes authors of visible history without a stored team`, () => {
  const unscoped = { id: 30, name: `Former author`, teamIds: [] }
  const visible = { ...catalog, admins: [...catalog.admins, unscoped] }
  assert.equal(actionEventsAdmins({ mode: `all`, ids: [] }, visible).includes(unscoped), true)
  assert.equal(actionEventsAdmins({ mode: `mine`, ids: [] }, visible).includes(unscoped), false)
})

test(`search and different filters intersect while team and admin choices are unions`, () => {
  const query = { ...createActionEventsQuery(), search: `abc123`, admins: [10, 20], teams: { mode: `selected` as const, ids: [1, 2] } }
  assert.equal(matchesActionEvent(event, query, catalog), true)
  assert.equal(matchesActionEvent(event, { ...query, search: `not present` }, catalog), false)
  assert.equal(matchesActionEvent(event, { ...query, admins: [20] }, catalog), false)
  assert.equal(matchesActionEvent(event, { ...query, since: now - 1000 }, catalog), false)
})

test(`Pending includes queued, claimed and submitting work without including terminal outcomes`, () => {
  const query = { ...createActionEventsQuery(), status: `pending` as const }
  for (const status of [`pending`, `claimed`, `submitting`] as const) assert.equal(matchesActionEvent({ ...event, status }, query, catalog), true)
  for (const status of [`completed`, `failed`, `cancelled`, `unknown`] as const) assert.equal(matchesActionEvent({ ...event, status }, query, catalog), false)
})

test(`ruleset actions remain excluded in both actor modes`, () => {
  const automated = { ...event, admin: null, ruleset: `Anti-grief`, origin: `ruleset` as const }
  assert.equal(matchesActionEvent(automated, createActionEventsQuery(), catalog), false)
  assert.equal(matchesActionEvent(automated, createActionEventsQuery({ systemOnly: true }), catalog), false)
})

test(`regular catalog choices contain own teams and their historical admins while superadmins keep all`, () => {
  const scoped = scopeActionEventsCatalog(catalog, false)
  assert.deepEqual(scoped.teams.map(team => team.id), [1])
  assert.deepEqual(scoped.admins.map(admin => admin.id), [10])
  assert.deepEqual(scoped.admins[0].teamIds, [1])
  assert.equal(scopeActionEventsCatalog(catalog, true), catalog)
})

test(`System and source tags switch one query without retaining conflicting human filters`, () => {
  const initial = createActionEventsQuery({ admins: [10], sources: [`discord`], servers: [5], status: `failed` })
  const system = setActionEventsSystem(initial)
  assert.equal(system.systemOnly, true)
  assert.deepEqual(system.admins, [])
  assert.deepEqual(system.sources, [])
  assert.deepEqual(system.servers, [5])
  assert.equal(system.status, `failed`)
  const app = setActionEventsSource(system, `spellbook`)
  assert.equal(app.systemOnly, false)
  assert.deepEqual(app.sources, [`spellbook`])
  const both = setActionEventsSource(app, `discord`)
  assert.deepEqual(new Set(both.sources), new Set([`spellbook`, `discord`]))
  assert.equal(matchesActionEvent(event, both, catalog), false)
  assert.equal(setActionEventsAdmins(system, [10]).systemOnly, false)
  assert.deepEqual(setActionEventsAdmins(system, [10]).admins, [10])
  assert.equal(setActionEventsSystem(system).systemOnly, false)
})

test(`advanced badge counts five categories while toolbar tags are resettable independently`, () => {
  const source = createActionEventsQuery({ sources: [`discord`] })
  assert.equal(actionEventsAdvancedCount(source), 0)
  assert.equal(hasActionEventsFilters(source), true)
  assert.equal(actionEventsAdvancedCount(createActionEventsQuery({ systemOnly: true })), 0)
  assert.equal(hasActionEventsFilters(createActionEventsQuery({ systemOnly: true })), true)
  assert.equal(actionEventsAdvancedCount(createActionEventsQuery({ teams: { mode: `selected`, ids: [1] }, admins: [10],
    since: now, servers: [5], actionTypes: [`ban`, `kick`] })), 5)
})

test(`restored queries cannot keep invisible status or source selections`, () => {
  const query = normalizeActionEventsQuery(createActionEventsQuery({ sources: [`unknown`], status: `superseded`, teams: { mode: `mine`, ids: [] } }))
  assert.deepEqual(query.sources, [])
  assert.equal(query.status, `all`)
  assert.deepEqual(query.teams, { mode: `all`, ids: [] })
})
