import { writable } from "svelte/store"
import { getCoreApi } from '../../core'
import { CreditsAntiAfk } from './creditsAntiAfk'

export const creditsAntiAfk = new CreditsAntiAfk({
	antiAfkState: async () => getCoreApi().antiAfkState(),
	setAntiAfkEnabled: async enabled => getCoreApi().setAntiAfkEnabled(enabled)
})

export const creditsRequest = writable<{ returnFocus: HTMLButtonElement | null } | null>(null)

export function openCredits(returnFocus: HTMLButtonElement | null = null): void {
	creditsRequest.set({ returnFocus })
}

export function closeCredits(): void {
	creditsRequest.set(null)
}
