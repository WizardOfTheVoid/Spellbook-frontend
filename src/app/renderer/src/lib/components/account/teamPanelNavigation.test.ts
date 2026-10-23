import assert from 'node:assert/strict'
import test from 'node:test'
import { applyTeamNavigationRequest, createTeamSelection } from './teamPanelNavigation'

test(`loads an unmounted team panel before selecting a notification target`, async () => {
	let loaded = false
	let selectedTeamId: number | null = null

	await applyTeamNavigationRequest(7, {
		isLoaded: () => loaded,
		load: async () => { loaded = true },
		hasTeam: teamId => loaded && teamId === 7,
		select: async teamId => { selectedTeamId = teamId },
	})

	assert.equal(selectedTeamId, 7)
})

test(`uses an already loaded team list without refreshing it`, async () => {
	let loadCount = 0

	await applyTeamNavigationRequest(7, {
		isLoaded: () => true,
		load: async () => { loadCount += 1 },
		hasTeam: teamId => teamId === 7,
		select: async () => {},
	})

	assert.equal(loadCount, 0)
})

test(`does not report a cancelled selection as applied`, async () => {
  assert.equal(await applyTeamNavigationRequest(7, {
    isLoaded: () => true, load: async () => {}, hasTeam: () => true, select: async () => false
  }), false)
})

test(`explicit list navigation clears a previous detail without requiring a matching team`, async () => {
  let selected: number | null = 7
  assert.equal(await applyTeamNavigationRequest(null, {
    isLoaded: () => true, load: async () => {}, hasTeam: () => false,
    select: async id => { selected = id; return true }
  }), true)
  assert.equal(selected, null)
})

test(`a superseded request cannot select after its team list finishes loading`, async () => {
  let current = true
  let selected = false
  assert.equal(await applyTeamNavigationRequest(7, {
    isLoaded: () => false, load: async () => { current = false }, hasTeam: () => true,
    isCurrent: () => current, select: async () => { selected = true; return true }
  }), false)
  assert.equal(selected, false)
})

test(`content Back cancels an outstanding member load before it can reopen a team`, async () => {
  const selection = createTeamSelection()
  let finish!: (value: number) => void
  let displayedTeam: number | null = 3
  const pending = selection.run(() => new Promise<number>(resolve => { finish = resolve }), teamId => { displayedTeam = teamId })
  selection.cancel()
  displayedTeam = null
  finish(7)
  assert.equal(await pending, false)
  assert.equal(displayedTeam, null)
})
