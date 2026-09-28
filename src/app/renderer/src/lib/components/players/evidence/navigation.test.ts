import assert from 'node:assert/strict'
import test from 'node:test'
import { get } from 'svelte/store'
import { createDbPlayerState, mergePlayerState } from '$lib/utils/playerStateData'
import * as navigation from './navigation'

test(`evidence navigation keeps the selected player and requested destination`, () => {
  const selected = navigation.evidencePlayerSelection(createDbPlayerState({
    id: 42, playfabId: `ABC123`, latestName: `Samwise`, lastLogin: null,
    playtimeHours: 10, activeBanKind: null, isOnline: false
  }))
  navigation.requestEvidenceNavigation(`add`, selected)
  const upload = get(navigation.evidenceNavigationRequest)
  assert.equal(upload?.player.id, 42)
  assert.equal(upload?.player.playfabId, `ABC123`)
  assert.equal(upload?.player.latestName, `Samwise`)
  assert.equal(upload?.action, `add`)
  navigation.requestEvidenceNavigation(`view`, selected, { wanted: true })
  const view = get(navigation.evidenceNavigationRequest)
  assert.equal(view?.action, `view`)
  assert.equal(view?.wanted, true)
  navigation.clearEvidenceNavigation(upload!.sequence)
  assert.equal(get(navigation.evidenceNavigationRequest)?.sequence, view?.sequence)
  navigation.clearEvidenceNavigation(view!.sequence)
  assert.equal(get(navigation.evidenceNavigationRequest), null)
})

test(`a player reference opens its profile without changing the referenced identity`, () => {
  navigation.requestOpenPlayerReference({ id: 42, playfabId: `ABC123`, latestName: `Samwise` })
  const profile = get(navigation.evidenceNavigationRequest)
  assert.equal(profile?.action, `profile`)
  assert.equal(profile?.player.id, 42)
  assert.equal(profile?.player.playfabId, `ABC123`)
  navigation.clearEvidenceNavigation(profile!.sequence)
})

test(`uploading for a live player without a database record keeps its PlayFab identity`, () => {
  const selected = navigation.evidencePlayerSelection(mergePlayerState({
    index: 1, name: `New live player`, playfabId: `AB123456789ABC`, rawLine: `New live player AB123456789ABC`
  }, null))
  navigation.requestEvidenceNavigation(`add`, selected)
  const upload = get(navigation.evidenceNavigationRequest)
  assert.equal(upload?.action, `add`)
  assert.equal(upload?.player.id, null)
  assert.equal(upload?.player.playfabId, `AB123456789ABC`)
  assert.equal(upload?.player.latestName, `New live player`)
  navigation.clearEvidenceNavigation(upload!.sequence)
})
