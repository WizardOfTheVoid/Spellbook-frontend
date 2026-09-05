import type { Component } from 'svelte'

export type LazyPanelName =
	| 'server'
	| 'players'
	| 'wanted'
	| 'wanted-player'
	| 'player'
	| 'profiles'
	| 'servers'
	| 'notifications'
	| 'settings'
	| 'account'
	| 'teams'
	| 'admin'

export type LazyPanelComponent = Component<any>
type LazyPanelModule = { default: LazyPanelComponent }
type LazyPanelLoader = () => Promise<LazyPanelModule>

const loaders: Record<LazyPanelName, LazyPanelLoader> = {
	server: () => import('../players/ServerPlayersPanel.svelte'),
	players: () => import('../players/DatabasePlayersPanel.svelte'),
	wanted: () => import('../players/WantedPanel.svelte'),
	'wanted-player': () => import('../players/WantedDetail.svelte'),
	player: () => import('../players/PlayerDetailPanel.svelte'),
	profiles: () => import('../profiles/ProfilesPanel.svelte'),
	servers: () => import('../servers/ServersPanel.svelte'),
	notifications: () => import('../notifications/NotificationsPanel.svelte'),
	settings: () => import('../settings/SettingsPanel.svelte'),
	account: () => import('../account/ProfilePanel.svelte'),
	teams: () => import('../account/TeamsPanel.svelte'),
	admin: () => import('../admin/AdminPanel.svelte'),
}

export function createLazyPanelRegistry(source: Readonly<Record<string, LazyPanelLoader>>) {
	const cache = new Map<string, Promise<LazyPanelComponent>>()
	return {
		load(name: string): Promise<LazyPanelComponent> {
			const existing = cache.get(name)
			if (existing) return existing
			const loader = source[name]
			if (!loader) return Promise.reject(new Error(`Unknown lazy panel: ${name}`))
			const request = loader()
				.then(module => module.default)
				.catch(error => {
					cache.delete(name)
					throw error
				})
			cache.set(name, request)
			return request
		},
		async preload(): Promise<void> {
			for (const name of Object.keys(source)) {
				try {
					await this.load(name)
				} catch {
					// Navigation can retry a rejected chunk later.
				}
			}
		},
	}
}

const registry = createLazyPanelRegistry(loaders)

export function loadLazyPanel(name: LazyPanelName): Promise<LazyPanelComponent> {
	return registry.load(name)
}

export function preloadLazyPanels(): Promise<void> {
	return registry.preload()
}

export function schedulePanelPreload(
	target: Pick<Window, 'requestAnimationFrame' | 'cancelAnimationFrame' | 'requestIdleCallback' | 'cancelIdleCallback' | 'setTimeout' | 'clearTimeout'>,
	preload: () => Promise<void> = preloadLazyPanels,
	timeoutMs = 1500,
): () => void {
	let cancelled = false
	let idleId: number | null = null
	let timerId: number | null = null
	const frameId = target.requestAnimationFrame(() => {
		let started = false
		const run = (): void => {
			if (cancelled || started) return
			started = true
			if (idleId !== null) target.cancelIdleCallback(idleId)
			if (timerId !== null) target.clearTimeout(timerId)
			void preload()
		}
		idleId = target.requestIdleCallback(run, { timeout: timeoutMs })
		timerId = target.setTimeout(run, timeoutMs)
	})

	return () => {
		cancelled = true
		target.cancelAnimationFrame(frameId)
		if (idleId !== null) target.cancelIdleCallback(idleId)
		if (timerId !== null) target.clearTimeout(timerId)
	}
}
