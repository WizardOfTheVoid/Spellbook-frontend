import assert from 'node:assert/strict'
import test from 'node:test'
import { get } from 'svelte/store'

type ProfilePreferencesSession = { userId: number, generation: number }
type ProfilePreferencesStore = {
	subscribe: (run: (state: { userId: number | null, revision: number }) => void) => () => void
	syncUser: (userId: number | null) => void
	captureSession: () => ProfilePreferencesSession | null
	isCurrent: (session: ProfilePreferencesSession | null) => boolean
	changed: (session: ProfilePreferencesSession | null) => boolean
}

test(`increments refresh state only for the account that started the preference update`, async () => {
	const { createProfilePreferencesStore } = await loadStore()
	const store = createProfilePreferencesStore()
	store.syncUser(7)
	const session = store.captureSession()

	assert.deepEqual(get(store), { userId: 7, revision: 0 })
	assert.equal(store.changed(session), true)
	assert.deepEqual(get(store), { userId: 7, revision: 1 })
	assert.equal(store.isCurrent(session), true)
})

test(`clears account state on logout and ignores an old account response after switching users`, async () => {
	const { createProfilePreferencesStore } = await loadStore()
	const store = createProfilePreferencesStore()
	store.syncUser(7)
	const oldSession = store.captureSession()
	store.changed(oldSession)

	store.syncUser(null)
	assert.deepEqual(get(store), { userId: null, revision: 0 })
	assert.equal(store.isCurrent(oldSession), false)
	assert.equal(store.changed(oldSession), false)

	store.syncUser(8)
	assert.deepEqual(get(store), { userId: 8, revision: 0 })
	assert.equal(store.changed(oldSession), false)
	assert.deepEqual(get(store), { userId: 8, revision: 0 })
})

test(`keeps a session stable when the same user is synchronized repeatedly`, async () => {
	const { createProfilePreferencesStore } = await loadStore()
	const store = createProfilePreferencesStore()
	store.syncUser(7)
	const session = store.captureSession()
	store.syncUser(7)

	assert.equal(store.isCurrent(session), true)
	assert.equal(store.changed(session), true)
	assert.deepEqual(get(store), { userId: 7, revision: 1 })
})

async function loadStore(): Promise<{ createProfilePreferencesStore: () => ProfilePreferencesStore }> {
	const modulePath = `./profilePreferencesStore`
	const module = await import(modulePath).catch(() => ({}))
	assert.equal(typeof Reflect.get(module, `createProfilePreferencesStore`), `function`, `profile preferences should expose account-scoped refresh state`)
	return module as { createProfilePreferencesStore: () => ProfilePreferencesStore }
}
