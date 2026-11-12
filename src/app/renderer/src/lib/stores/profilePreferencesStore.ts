import { readonly, writable, type Readable } from 'svelte/store'
import { authState } from '$lib/auth/user'

export type ProfilePreferencesState = {
	userId: number | null
	revision: number
}

export type ProfilePreferencesSession = {
	userId: number
	generation: number
}

export type ProfilePreferencesStore = Readable<ProfilePreferencesState> & {
	syncUser(userId: number | null): void
	captureSession(): ProfilePreferencesSession | null
	isCurrent(session: ProfilePreferencesSession | null): boolean
	changed(session: ProfilePreferencesSession | null): boolean
}

export function createProfilePreferencesStore(): ProfilePreferencesStore {
	const initial: ProfilePreferencesState = { userId: null, revision: 0 }
	const state = writable(initial)
	let current = initial
	let generation = 0

	function syncUser(userId: number | null): void {
		if (userId === current.userId) return
		generation += 1
		current = { userId, revision: 0 }
		state.set(current)
	}

	function captureSession(): ProfilePreferencesSession | null {
		return current.userId === null ? null : { userId: current.userId, generation }
	}

	function isCurrent(session: ProfilePreferencesSession | null): boolean {
		return Boolean(session && session.userId === current.userId && session.generation === generation)
	}

	function changed(session: ProfilePreferencesSession | null): boolean {
		if (!isCurrent(session)) return false
		current = { ...current, revision: current.revision + 1 }
		state.set(current)
		return true
	}

	return { ...readonly(state), syncUser, captureSession, isCurrent, changed }
}

export const profilePreferencesState = createProfilePreferencesStore()

authState.subscribe(({ user }) => profilePreferencesState.syncUser(user?.id ?? null))
