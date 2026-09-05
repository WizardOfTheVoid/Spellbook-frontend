import assert from 'node:assert/strict'
import test from 'node:test'
import { applyTeamNavigationRequest } from './teamPanelNavigation'

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
