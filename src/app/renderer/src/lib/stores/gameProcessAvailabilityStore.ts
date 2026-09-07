import { writable, type Readable } from "svelte/store"
import { getCoreApi, type ChivCoreApi, type CoreCallResult } from "$lib/core"

const POLL_INTERVAL_MS = 2_000
const STALE_AFTER_MS = 5_000
const STALE_CHECK_MS = 1_000

type GameProcessMetaApi = Pick<ChivCoreApi, "meta">

type Scheduler = {
	now(): number
	setInterval(callback: () => void, milliseconds: number): number
	clearInterval(id: number): void
}

export type GameProcessAvailabilityStore = Readable<boolean> & {
	sync(active: boolean): void
	refresh(): Promise<void>
	destroy(): void
}

export function createGameProcessAvailabilityStore(
	api: GameProcessMetaApi,
	scheduler: Scheduler = browserScheduler,
): GameProcessAvailabilityStore {
	const state = writable(false)
	let active = false
	let generation = 0
	let lastSuccessAt: number | null = null
	let inFlight: Promise<void> | null = null
	let pollInterval: number | null = null
	let staleInterval: number | null = null

	async function poll(): Promise<void> {
		if (!active) return
		if (inFlight) return inFlight

		const requestGeneration = generation
		inFlight = api.meta()
			.then(result => {
				if (!active || requestGeneration !== generation) return
				const gameRunning = readGameRunning(result)
				if (gameRunning === null) {
					lastSuccessAt = null
					state.set(false)
					return
				}
				lastSuccessAt = scheduler.now()
				state.set(gameRunning)
			})
			.catch(() => {
				if (!active || requestGeneration !== generation) return
				lastSuccessAt = null
				state.set(false)
			})
			.finally(() => {
				if (requestGeneration === generation) inFlight = null
			})

		return inFlight
	}

	function checkStale(): void {
		if (
			active
			&& lastSuccessAt !== null
			&& scheduler.now() - lastSuccessAt > STALE_AFTER_MS
		) {
			state.set(false)
		}
	}

	function stop(): void {
		generation += 1
		active = false
		lastSuccessAt = null
		inFlight = null
		if (pollInterval !== null) scheduler.clearInterval(pollInterval)
		if (staleInterval !== null) scheduler.clearInterval(staleInterval)
		pollInterval = null
		staleInterval = null
		state.set(false)
	}

	return {
		subscribe: state.subscribe,
		sync(nextActive) {
			if (nextActive === active) return
			if (!nextActive) {
				stop()
				return
			}

			active = true
			generation += 1
			pollInterval = scheduler.setInterval(() => void poll(), POLL_INTERVAL_MS)
			staleInterval = scheduler.setInterval(checkStale, STALE_CHECK_MS)
			void poll()
		},
		refresh: poll,
		destroy: stop,
	}
}

function readGameRunning(result: CoreCallResult): boolean | null {
	if (!result.ok || !isRecord(result.data)) return null
	const envelope = result.data
	if (envelope.ok !== true || !isRecord(envelope.data)) return null
	return typeof envelope.data.gameRunning === "boolean"
		? envelope.data.gameRunning
		: null
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

const browserScheduler: Scheduler = {
	now: () => Date.now(),
	setInterval: (callback, milliseconds) => window.setInterval(callback, milliseconds),
	clearInterval: id => window.clearInterval(id),
}

export const gameProcessAvailable = createGameProcessAvailabilityStore({
	meta: () => getCoreApi().meta(),
})

export function syncGameProcessAvailability(active: boolean): void {
	gameProcessAvailable.sync(active)
}

export function stopGameProcessAvailability(): void {
	gameProcessAvailable.destroy()
}
