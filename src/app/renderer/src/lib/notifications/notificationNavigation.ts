import type { ActivePage } from '$lib/types/ui'
import { parseNotificationCallback } from '@spellbook/shared/notificationCallbacks.js'

export type NotificationNavigationTarget =
	| { page: ActivePage }
	| { page: 'teams', teamId: number, teamView?: 'requests' }
	| { page: 'wanted', playfabId: string }
	| { page: 'players', playfabId: string, subpage: 'notes' }

export type NotificationNavigationPorts = {
	selectPage(page: ActivePage): boolean
	selectTeam(teamId: number, teamView?: 'requests'): Promise<void>
	openWantedPlayer(playfabId: string): Promise<void>
	openPlayerNotes(playfabId: string): Promise<void>
	invalid(uri: string): void
}

export type RequestedTeamNavigation = {
	requestId: number
	teamId: number
	teamView?: 'requests'
}

class NotificationNavigationCanceledError extends Error {
	constructor() {
		super('Notification navigation was canceled.')
		this.name = 'NotificationNavigationCanceledError'
	}
}

export function createNotificationNavigationIntent(): {
	invalidate(): void
	run<T>(load: () => Promise<T>, commit: (value: T) => void): Promise<boolean>
} {
	let generation = 0

	return {
		invalidate(): void {
			generation += 1
		},
		async run<T>(load: () => Promise<T>, commit: (value: T) => void): Promise<boolean> {
			const currentGeneration = ++generation
			try {
				const value = await load()
				if (currentGeneration !== generation) return false
				commit(value)
				return true
			} catch (error) {
				if (currentGeneration !== generation) return false
				throw error
			}
		},
	}
}

export function createNotificationNavigationLifecycle(
	resetNavigation: () => void,
	onReset: () => void,
): {
	reset(): void
	leave(action: () => Promise<void>): Promise<void>
} {
	const reset = (): void => {
		resetNavigation()
		onReset()
	}

	return {
		reset,
		async leave(action: () => Promise<void>): Promise<void> {
			reset()
			await action()
		},
	}
}

export function createNotificationNavigationReset(
	intent: { invalidate(): void },
	resetTeam: () => void,
): () => void {
	return () => {
		intent.invalidate()
		resetTeam()
	}
}

export function createTeamNavigationHandoff(
	onChange: (request: RequestedTeamNavigation | null) => void,
): {
	request(teamId: number, teamView?: 'requests'): Promise<void>
	handled(requestId: number, error?: unknown): void
	reset(): void
} {
	let nextRequestId = 0
	let current: (RequestedTeamNavigation & {
		resolve(): void
		reject(error: Error): void
	}) | null = null

	return {
		request(teamId: number, teamView?: 'requests'): Promise<void> {
			current?.reject(new Error('Team navigation was superseded.'))
			const requestId = ++nextRequestId
			return new Promise<void>((resolve, reject) => {
				current = { requestId, teamId, teamView, resolve, reject }
				onChange({ requestId, teamId, ...(teamView ? { teamView } : {}) })
			})
		},
		handled(requestId: number, error?: unknown): void {
			if (current?.requestId !== requestId) return
			const handled = current
			current = null
			onChange(null)
			if (error === undefined) handled.resolve()
			else handled.reject(error instanceof Error ? error : new Error('Team request failed.'))
		},
		reset(): void {
			const canceled = current
			current = null
			onChange(null)
			canceled?.reject(new NotificationNavigationCanceledError())
		},
	}
}

export function resolveNotificationCallback(uri: string): NotificationNavigationTarget | null {
	const callback = parseNotificationCallback({ label: 'Open', uri })
	if (!callback) return null

	const [page, id, subpage] = callback.uri.split('/').filter(Boolean)
	if (page === 'teams' && id) return { page, teamId: Number(id), ...(subpage === 'requests' ? { teamView: 'requests' as const } : {}) }
	if (page === 'wanted' && id) return { page, playfabId: id }
	if (page === 'players' && id && subpage === 'notes') return { page, playfabId: id, subpage }
	return { page: page as ActivePage }
}

export async function openNotificationTarget(
	uri: string,
	ports: NotificationNavigationPorts,
): Promise<boolean> {
	const target = resolveNotificationCallback(uri)
	if (!target) {
		ports.invalid(uri)
		return false
	}

	try {
		if (!ports.selectPage(target.page)) {
			ports.invalid(uri)
			return false
		}
		if ('teamId' in target) await ports.selectTeam(target.teamId, target.teamView)
		if ('subpage' in target) await ports.openPlayerNotes(target.playfabId)
		else if ('playfabId' in target) await ports.openWantedPlayer(target.playfabId)
		return true
	} catch (error) {
		if (error instanceof NotificationNavigationCanceledError) return false
		ports.invalid(uri)
		return false
	}
}
