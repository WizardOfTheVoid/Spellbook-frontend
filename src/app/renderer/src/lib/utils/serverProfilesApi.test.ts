import assert from 'node:assert/strict'
import test from 'node:test'
import type { CoreCallResult, ProfileOwner, ServerProfileGraphInput } from '$lib/core'

test(`profile attachment saves retain the existing request and propagate stale claim conflicts`, async () => {
	const originalWindow = Object.getOwnPropertyDescriptor(globalThis, `window`)
	const calls: unknown[] = []
	const owner = { type: `team` as const, id: 6 }
	const input: ServerProfileGraphInput = { serverIds: [12] }
	let failed = false
	Object.defineProperty(globalThis, `window`, {
		configurable: true,
		value: { chivServer: { serverProfiles: { update: async (requestedOwner: ProfileOwner, profileId: number, body: unknown) => {
			calls.push([requestedOwner, profileId, body])
			return failed
				? { ok: false, status: 409, statusText: `Conflict`, data: null, error: { code: `CONFLICT`, message: `This server is no longer claimed by the team.` } }
				: result({ servers: [{ gameServerId: 12 }] })
		} } } }
	})
	try {
		const { updateServerProfile } = await import(`./serverProfilesApi`)
		assert.deepEqual((await updateServerProfile(owner, 7, input)).servers, [{ gameServerId: 12 }])
		failed = true
		await assert.rejects(() => updateServerProfile(owner, 7, input), /no longer claimed/u)
		assert.deepEqual(calls, [[owner, 7, input], [owner, 7, input]])
		assert.deepEqual(input, { serverIds: [12] })
	} finally {
		if (originalWindow) Object.defineProperty(globalThis, `window`, originalWindow)
		else delete (globalThis as { window?: unknown }).window
	}
})

test(`sets the current account preference for the selected profile owner`, async () => {
	const calls: unknown[] = []
	const api = installApi(async (owner, profileId, isEnabled) => {
		calls.push([owner, profileId, isEnabled])
		return result({ isEnabledForUser: false })
	})

	try {
		const modulePath = `./serverProfilesApi`
		const { setServerProfileEnabled } = await import(modulePath)
		assert.equal(await setServerProfileEnabled({ type: `team`, id: 6 }, 12, false), false)
		assert.deepEqual(calls, [[{ type: `team`, id: 6 }, 12, false]])
	} finally {
		api.restore()
	}
})

function installApi(setEnabled: (owner: ProfileOwner, profileId: number, isEnabled: boolean) => Promise<CoreCallResult>) {
	const originalWindow = Object.getOwnPropertyDescriptor(globalThis, `window`)
	Object.defineProperty(globalThis, `window`, {
		configurable: true,
		value: { chivServer: { serverProfiles: { setEnabled } } },
	})
	return {
		restore: () => {
			if (originalWindow) Object.defineProperty(globalThis, `window`, originalWindow)
			else delete (globalThis as { window?: unknown }).window
		},
	}
}

function result<T>(data: T): CoreCallResult {
	return { ok: true, status: 200, statusText: `OK`, data: { ok: true, data } }
}
