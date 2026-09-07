import assert from 'node:assert/strict'
import test from 'node:test'
import type { CoreCallResult, ProfileOwner } from '$lib/core'

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
