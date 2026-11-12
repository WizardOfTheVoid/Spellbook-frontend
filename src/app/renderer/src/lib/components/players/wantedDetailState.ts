import type { WantedDetail } from '$lib/core'

export type WantedDetailContext = {
	playerId: number
	sessionRevision: number
}

export type WantedDetailViewState = {
	detail: WantedDetail | null
	loading: boolean
	inactive: boolean
	error: string | null
	mutation: `revert` | `remove` | null
}

export type WantedMutationResult =
	| { status: `applied` }
	| { status: `error`, error: string }
	| { status: `stale` }

type WantedDetailDependencies = {
	load: (playerId: number) => Promise<WantedDetail | null>
	revert: (playerId: number, sourceActionId: number) => Promise<WantedDetail>
	remove: (playerId: number) => Promise<void>
	onChange?: (state: WantedDetailViewState) => void
}

export function createWantedDetailController(dependencies: WantedDetailDependencies) {
	let context: WantedDetailContext | null = null
	let contextRevision = 0
	let requestRevision = 0
	let destroyed = false
	let state: WantedDetailViewState = emptyState()

	const emit = () => dependencies.onChange?.({ ...state })
	const current = (contextVersion: number, requestVersion: number) =>
		!destroyed && contextRevision === contextVersion && requestRevision === requestVersion

	async function load(retainDetail: boolean): Promise<boolean> {
		if (!context || destroyed) return false
		const selected = context
		const contextVersion = contextRevision
		const requestVersion = ++requestRevision
		state = {
			...state,
			detail: retainDetail ? state.detail : null,
			loading: true,
			inactive: false,
			error: null,
		}
		emit()

		try {
			const detail = await dependencies.load(selected.playerId)
			if (!current(contextVersion, requestVersion)) return false
			state = {
				...state,
				detail,
				loading: false,
				inactive: detail === null,
				error: null,
			}
			emit()
			return true
		} catch (error) {
			if (!current(contextVersion, requestVersion)) return false
			state = {
				...state,
				loading: false,
				error: error instanceof Error ? error.message : `Wanted detail request failed.`,
			}
			emit()
			return false
		}
	}

	async function mutate(
		kind: `revert` | `remove`,
		expectedSourceActionId?: number,
	): Promise<WantedMutationResult> {
		if (!context || !state.detail || state.mutation || destroyed) return { status: `stale` }
		if (kind === `revert` && state.detail.wanted.originalActionId !== expectedSourceActionId) {
			return { status: `stale` }
		}
		const selected = context
		const contextVersion = contextRevision
		const requestVersion = ++requestRevision
		state = { ...state, mutation: kind, error: null }
		emit()

		try {
			if (kind === `remove`) {
				await dependencies.remove(selected.playerId)
				if (!current(contextVersion, requestVersion)) return { status: `stale` }
				state = { ...state, detail: null, inactive: true, mutation: null }
				emit()
				return { status: `applied` }
			}

			const detail = await dependencies.revert(selected.playerId, expectedSourceActionId!)
			if (!current(contextVersion, requestVersion)) return { status: `stale` }
			if (detail.wanted.playerId !== selected.playerId) throw new Error(`Wanted action returned the wrong player.`)
			state = { ...state, detail, inactive: false, mutation: null }
			emit()
			return { status: `applied` }
		} catch (error) {
			if (!current(contextVersion, requestVersion)) return { status: `stale` }
			const message = error instanceof Error ? error.message : `Wanted action failed.`
			state = {
				...state,
				mutation: null,
				error: message,
			}
			emit()
			return { status: `error`, error: message }
		}
	}

	return {
		async select(next: WantedDetailContext | null): Promise<void> {
			if (sameContext(context, next)) return
			context = next
			contextRevision += 1
			requestRevision += 1
			state = emptyState()
			emit()
			if (next) await load(false)
		},
		refresh: async (): Promise<boolean> => await load(true),
		revert: async (sourceActionId: number): Promise<WantedMutationResult> => await mutate(`revert`, sourceActionId),
		remove: async (): Promise<WantedMutationResult> => await mutate(`remove`),
		snapshot: (): WantedDetailViewState => ({ ...state }),
		destroy(): void {
			destroyed = true
			contextRevision += 1
			requestRevision += 1
		},
	}
}

function emptyState(): WantedDetailViewState {
	return { detail: null, loading: false, inactive: false, error: null, mutation: null }
}

function sameContext(left: WantedDetailContext | null, right: WantedDetailContext | null): boolean {
	return left?.playerId === right?.playerId && left?.sessionRevision === right?.sessionRevision
}
