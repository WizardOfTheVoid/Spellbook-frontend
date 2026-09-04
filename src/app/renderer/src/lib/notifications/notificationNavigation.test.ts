import assert from 'node:assert/strict'
import test from 'node:test'
import type { ActivePage } from '../types/ui'

type NavigationTarget =
	| { page: ActivePage }
	| { page: 'teams', teamId: number }
	| { page: 'wanted', playfabId: string }
	| { page: 'players', playfabId: string, subpage: 'notes' }

type NavigationPorts = {
	selectPage(page: ActivePage): boolean
	selectTeam(teamId: number): Promise<void>
	openWantedPlayer(playfabId: string): Promise<void>
	openPlayerNotes(playfabId: string): Promise<void>
	invalid(uri: string): void
}

type NavigationIntent = {
	invalidate(): void
	run<T>(load: () => Promise<T>, commit: (value: T) => void): Promise<boolean>
}

type NavigationLifecycle = {
	reset(): void
	leave(action: () => Promise<void>): Promise<void>
}

type TeamNavigationHandoff = {
	request(teamId: number): Promise<void>
	handled(requestId: number, error?: unknown): void
	reset(): void
}

type NotificationNavigationReset = () => void

test('resolves supported top-level, team, and Wanted callback targets', async () => {
	const { resolveNotificationCallback } = await loadNavigation()

	assert.deepEqual(resolveNotificationCallback('/notifications'), { page: 'notifications' })
	assert.deepEqual(resolveNotificationCallback('/teams/7'), { page: 'teams', teamId: 7 })
	assert.deepEqual(resolveNotificationCallback('/wanted/PLAYFAB_ID'), {
		page: 'wanted',
		playfabId: 'PLAYFAB_ID',
	})
	assert.deepEqual(resolveNotificationCallback('/players/PLAYFAB_ID/notes'), {
		page: 'players',
		playfabId: 'PLAYFAB_ID',
		subpage: 'notes',
	})
	assert.equal(resolveNotificationCallback('/teams/not-a-number'), null)
	assert.equal(resolveNotificationCallback('javascript:alert(1)'), null)
})

test('opens a player notes callback on the requested profile Notes subpage', async () => {
	const { openNotificationTarget } = await loadNavigation()
	const events: string[] = []

	assert.equal(await openNotificationTarget('/players/PLAYFAB_ID/notes', navigationPorts({
		selectPage: (page) => {
			events.push(`page:${page}`)
			return true
		},
		openPlayerNotes: async (playfabId) => {
			events.push(`notes:${playfabId}`)
		},
	})), true)
	assert.deepEqual(events, [`page:players`, `notes:PLAYFAB_ID`])
})

test('hands a team target to the root request state for selection after loading', async () => {
	const { openNotificationTarget } = await loadNavigation()
	let activePage: ActivePage = 'server'
	let requestedTeamId: number | null = null
	let settled = false
	const selected = deferred<void>()
	const ports = navigationPorts({
		selectPage: (page) => {
			activePage = page
			return true
		},
		selectTeam: async (teamId) => {
			requestedTeamId = teamId
			await selected.promise
		},
	})

	const opening = openNotificationTarget('/teams/7', ports).finally(() => {
		settled = true
	})
	await Promise.resolve()

	assert.equal(activePage, 'teams')
	assert.equal(requestedTeamId, 7)
	assert.equal(settled, false)
	selected.resolve()
	assert.equal(await opening, true)
})

test('waits for the Wanted profile handoff and opens the requested original player id', async () => {
	const { openNotificationTarget } = await loadNavigation()
	const loaded = deferred<void>()
	const events: string[] = []
	const ports = navigationPorts({
		selectPage: (page) => {
			events.push(`page:${page}`)
			return true
		},
		openWantedPlayer: async (playfabId) => {
			events.push(`fetch:${playfabId}`)
			await loaded.promise
			events.push(`player:${playfabId}`)
		},
	})

	let settled = false
	const opening = openNotificationTarget('/wanted/PLAYFAB_ID', ports).finally(() => {
		settled = true
	})
	await Promise.resolve()

	assert.equal(settled, false)
	assert.deepEqual(events, ['page:wanted', 'fetch:PLAYFAB_ID'])
	loaded.resolve()
	assert.equal(await opening, true)
	assert.deepEqual(events, ['page:wanted', 'fetch:PLAYFAB_ID', 'player:PLAYFAB_ID'])
})

test('signals an invalid or rejected target exactly once and remains usable', async () => {
	const { openNotificationTarget } = await loadNavigation()
	const invalid: string[] = []
	const ports = navigationPorts({
		invalid: (uri) => invalid.push(uri),
		openWantedPlayer: async () => {
			throw new Error('Profile unavailable.')
		},
	})

	assert.equal(await openNotificationTarget('/unknown', ports), false)
	assert.equal(await openNotificationTarget('/wanted/MISSING', ports), false)
	assert.deepEqual(invalid, ['/unknown', '/wanted/MISSING'])
	assert.equal(await openNotificationTarget('/settings', ports), true)
})

test('reports a callback failure when the current user cannot open Admin', async () => {
	const { openNotificationTarget } = await loadNavigation()
	const invalid: string[] = []

	assert.equal(await openNotificationTarget('/admin', navigationPorts({
		selectPage: () => false,
		invalid: (uri) => invalid.push(uri),
	})), false)
	assert.deepEqual(invalid, ['/admin'])
})

test('routes missing-team and member-load failures through the invalid port', async () => {
	const { openNotificationTarget } = await loadNavigation()
	for (const [uri, failure] of [
		['/teams/404', 'Team not found.'],
		['/teams/7', 'Members request failed.'],
	] as const) {
		const invalid: string[] = []
		const ports = navigationPorts({
			selectTeam: async () => {
				throw new Error(failure)
			},
			invalid: (rejectedUri) => invalid.push(rejectedUri),
		})

		assert.equal(await openNotificationTarget(uri, ports), false)
		assert.deepEqual(invalid, [uri])
	}
})

test('ignores an older team completion without clearing the newer request', async () => {
	const createTeamNavigationHandoff = await loadTeamNavigationHandoff()
	const changes: Array<{ requestId: number, teamId: number } | null> = []
	const handoff = createTeamNavigationHandoff((request) => changes.push(request))

	const first = handoff.request(7)
	const firstRequest = changes.at(-1)
	assert.ok(firstRequest)
	const second = handoff.request(8)
	const secondRequest = changes.at(-1)
	assert.ok(secondRequest)
	await assert.rejects(first, /superseded/i)

	handoff.handled(firstRequest.requestId)
	assert.deepEqual(changes.at(-1), secondRequest)
	handoff.handled(secondRequest.requestId)
	await second
	assert.equal(changes.at(-1), null)
})

test('silently cancels pending team handoffs on replacement and logout before late consumption', async () => {
	const {
		createNotificationNavigationIntent,
		createNotificationNavigationLifecycle,
		createNotificationNavigationReset,
		openNotificationTarget,
	} = await loadNavigation()
	const createTeamNavigationHandoff = await loadTeamNavigationHandoff()

	for (const exit of ['replacement', 'logout'] as const) {
		const changes: Array<{ requestId: number, teamId: number } | null> = []
		const invalid: string[] = []
		const handoff = createTeamNavigationHandoff((request) => changes.push(request))
		const lifecycle = createNotificationNavigationLifecycle(
			createNotificationNavigationReset!(createNotificationNavigationIntent(), handoff.reset),
			() => {},
		)
		const opening = openNotificationTarget('/teams/7', navigationPorts({
			selectTeam: handoff.request,
			invalid: (uri) => invalid.push(uri),
		}))
		const request = changes.at(-1)
		assert.ok(request, exit)

		if (exit === 'replacement') lifecycle.reset()
		else {
			await lifecycle.leave(async () => {
				assert.equal(changes.at(-1), null)
			})
		}

		assert.equal(changes.at(-1), null, exit)
		assert.equal(await opening, false, exit)
		assert.deepEqual(invalid, [], exit)

		handoff.handled(request.requestId)
		assert.equal(changes.at(-1), null, `${exit}: late completion`)
	}
})

test('navigation reset cancels a Team handoff before callback or manual replacement', async () => {
	const {
		createNotificationNavigationIntent,
		createNotificationNavigationReset,
		openNotificationTarget,
	} = await loadNavigation()
	const createTeamNavigationHandoff = await loadTeamNavigationHandoff()

	for (const replacement of ['wanted callback', 'page callback', 'manual navigation'] as const) {
		const changes: Array<{ requestId: number, teamId: number } | null> = []
		const invalid: string[] = []
		const pages: ActivePage[] = []
		const handoff = createTeamNavigationHandoff((request) => changes.push(request))
		assert.equal(typeof createNotificationNavigationReset, 'function')
		const reset = createNotificationNavigationReset!(createNotificationNavigationIntent(), handoff.reset)
		const opening = openNotificationTarget('/teams/7', navigationPorts({
			selectPage: (page) => {
				pages.push(page)
				return true
			},
			selectTeam: handoff.request,
			invalid: (uri) => invalid.push(uri),
		}))
		const request = changes.at(-1)
		assert.ok(request, replacement)

		reset()
		if (replacement === 'wanted callback') {
			assert.equal(await openNotificationTarget('/wanted/CURRENT', navigationPorts({
				selectPage: (page) => {
					pages.push(page)
					return true
				},
			})), true)
		} else if (replacement === 'page callback') {
			assert.equal(await openNotificationTarget('/settings', navigationPorts({
				selectPage: (page) => {
					pages.push(page)
					return true
				},
			})), true)
		} else {
			pages.push('players')
		}

		assert.equal(await opening, false, replacement)
		handoff.handled(request.requestId, new Error('Late Team failure.'))
		assert.deepEqual(changes, [request, null], replacement)
		assert.deepEqual(invalid, [], replacement)
	}
})

test('Wanted callbacks resolving in reverse order commit only the newest intent', async () => {
	const { createNotificationNavigationIntent, openNotificationTarget } = await loadNavigation()
	const intent = createNotificationNavigationIntent()
	const profiles = new Map([
		['OLDER', deferred<string>()],
		['NEWER', deferred<string>()],
	])
	let selectedPlayer: string | null = null
	const ports = navigationPorts({
		openWantedPlayer: async (playfabId) => {
			await intent.run(
				() => profiles.get(playfabId)!.promise,
				(player) => { selectedPlayer = player },
			)
		},
	})
	const open = (playfabId: string) => {
		intent.invalidate()
		return openNotificationTarget(`/wanted/${playfabId}`, ports)
	}

	const older = open('OLDER')
	const newer = open('NEWER')
	profiles.get('NEWER')?.resolve('newer player')
	await newer
	profiles.get('OLDER')?.resolve('older player')
	await older

	assert.equal(selectedPlayer, 'newer player')
})

test('manual navigation and session replacement invalidate a pending Wanted callback', async () => {
	const { createNotificationNavigationIntent, openNotificationTarget } = await loadNavigation()

	for (const invalidation of ['manual navigation', 'session replacement']) {
		const intent = createNotificationNavigationIntent()
		const profile = deferred<string>()
		let selectedPlayer: string | null = null
		const opening = openNotificationTarget('/wanted/LATE', navigationPorts({
			openWantedPlayer: async () => {
				await intent.run(
					() => profile.promise,
					(player) => { selectedPlayer = player },
				)
			},
		}))

		intent.invalidate()
		profile.resolve(invalidation)
		await opening

		assert.equal(selectedPlayer, null, invalidation)
	}
})

test('session exit clears transient targets and invalidates Wanted work before logout settles', async () => {
	const {
		createNotificationNavigationIntent,
		createNotificationNavigationLifecycle,
	} = await loadNavigation()
	const intent = createNotificationNavigationIntent()
	const profile = deferred<string>()
	const logout = deferred<void>()
	const events: string[] = []
	let selectedPlayer: string | null = 'previous player'
	let transientTargets = ['old callback']
	const lifecycle = createNotificationNavigationLifecycle(() => intent.invalidate(), () => {
		events.push('reset')
		selectedPlayer = null
		transientTargets = []
	})
	const opening = intent.run(
		() => profile.promise,
		(player) => { selectedPlayer = player },
	)
	const leaving = lifecycle.leave(async () => {
		events.push('logout:start')
		await logout.promise
		events.push('logout:end')
	})

	assert.deepEqual(events, ['reset', 'logout:start'])
	assert.equal(selectedPlayer, null)
	assert.deepEqual(transientTargets, [])
	profile.resolve('stale player')
	assert.equal(await opening, false)
	assert.equal(selectedPlayer, null)

	logout.resolve()
	await leaving
	assert.deepEqual(events, ['reset', 'logout:start', 'logout:end'])
})

test('suppresses stale Wanted load failures but reports a current failure', async () => {
	const { createNotificationNavigationIntent, openNotificationTarget } = await loadNavigation()
	const intent = createNotificationNavigationIntent()
	const staleProfile = deferred<string>()
	const invalid: string[] = []
	let selectedPlayer: string | null = null
	const ports = navigationPorts({
		openWantedPlayer: async () => {
			await intent.run(
				() => staleProfile.promise,
				(player) => { selectedPlayer = player },
			)
		},
		invalid: (uri) => invalid.push(uri),
	})
	const staleOpening = openNotificationTarget('/wanted/STALE', ports)
	intent.invalidate()
	staleProfile.reject(new Error('Stale profile failed.'))

	assert.equal(await staleOpening, true)
	assert.equal(selectedPlayer, null)
	assert.equal(invalid.length, 0)

	const currentProfile = deferred<string>()
	const currentOpening = openNotificationTarget('/wanted/CURRENT', navigationPorts({
		openWantedPlayer: async () => {
			await intent.run(
				() => currentProfile.promise,
				(player) => { selectedPlayer = player },
			)
		},
		invalid: (uri) => invalid.push(uri),
	}))
	currentProfile.reject(new Error('Current profile failed.'))

	assert.equal(await currentOpening, false)
	assert.equal(selectedPlayer, null)
	assert.deepEqual(invalid, ['/wanted/CURRENT'])
})

async function loadNavigation(): Promise<{
	resolveNotificationCallback(uri: string): NavigationTarget | null
	openNotificationTarget(uri: string, ports: NavigationPorts): Promise<boolean>
	createNotificationNavigationIntent(): NavigationIntent
	createNotificationNavigationLifecycle(
		resetNavigation: () => void,
		onReset: () => void,
	): NavigationLifecycle
	createNotificationNavigationReset?(
		intent: Pick<NavigationIntent, 'invalidate'>,
		resetTeam: () => void,
	): NotificationNavigationReset
}> {
	const modulePath = './notificationNavigation'
	const module = await import(modulePath).catch(() => ({}))
	const resolver = Reflect.get(module, 'resolveNotificationCallback')
	const opener = Reflect.get(module, 'openNotificationTarget')
	const intentFactory = Reflect.get(module, 'createNotificationNavigationIntent')
	const lifecycleFactory = Reflect.get(module, 'createNotificationNavigationLifecycle')
	const resetFactory = Reflect.get(module, 'createNotificationNavigationReset')
	assert.equal(typeof resolver, 'function')
	assert.equal(typeof opener, 'function')
	assert.equal(typeof intentFactory, 'function')
	assert.equal(typeof lifecycleFactory, 'function')
	return {
		resolveNotificationCallback: resolver as (uri: string) => NavigationTarget | null,
		openNotificationTarget: opener as (uri: string, ports: NavigationPorts) => Promise<boolean>,
		createNotificationNavigationIntent: intentFactory as () => NavigationIntent,
		createNotificationNavigationLifecycle: lifecycleFactory as (
			resetNavigation: () => void,
			onReset: () => void,
		) => NavigationLifecycle,
		createNotificationNavigationReset: resetFactory as ((
			intent: Pick<NavigationIntent, 'invalidate'>,
			resetTeam: () => void,
		) => NotificationNavigationReset) | undefined,
	}
}

function navigationPorts(overrides: Partial<NavigationPorts>): NavigationPorts {
	return {
		selectPage: () => true,
		selectTeam: async () => {},
		openWantedPlayer: async () => {},
		openPlayerNotes: async () => {},
		invalid: () => {},
		...overrides,
	}
}

async function loadTeamNavigationHandoff(): Promise<(
	onChange: (request: { requestId: number, teamId: number } | null) => void,
) => TeamNavigationHandoff> {
	const modulePath = './notificationNavigation'
	const module = await import(modulePath).catch(() => ({}))
	const factory = Reflect.get(module, 'createTeamNavigationHandoff')
	assert.equal(typeof factory, 'function')
	return factory as (
		onChange: (request: { requestId: number, teamId: number } | null) => void,
	) => TeamNavigationHandoff
}

function deferred<T>(): { promise: Promise<T>, resolve(value: T): void, reject(error: unknown): void } {
	let resolve!: (value: T) => void
	let reject!: (error: unknown) => void
	const promise = new Promise<T>((next, fail) => {
		resolve = next
		reject = fail
	})
	return { promise, resolve, reject }
}
