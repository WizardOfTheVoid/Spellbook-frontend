import assert from 'node:assert/strict'
import test from 'node:test'
import type { CoreCallResult } from '$lib/core'
import { warmAuthenticatedCaches } from './cacheWarmup'

test('warms independent authenticated reads concurrently and contains each failure', async () => {
	const calls: string[] = []
	const teamRead = deferred<CoreCallResult>()
	const api = {
		teams: {
			list: () => { calls.push('teams'); return teamRead.promise },
		},
		profileOwners: async () => { calls.push('profileOwners'); throw new Error('offline') },
	}
	const warming = warmAuthenticatedCaches(api)

	await Promise.resolve()
	assert.deepEqual(calls.sort(), ['profileOwners', 'teams'])
	teamRead.resolve({ ok: true, status: 200, statusText: 'OK', data: [] })
	await warming
})

function deferred<T>() {
	let resolve!: (value: T) => void
	const promise = new Promise<T>(next => { resolve = next })
	return { promise, resolve }
}
