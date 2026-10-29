export const tickActionLogLimit = 30

export type TickActionLogClearState = {
	clearedThrough: (runId: number) => number
	clearThrough: (runId: number, logId: number) => void
}

export function createTickActionLogClearState(): TickActionLogClearState {
	const clearedThroughIds = new Map<number, number>()

	return {
		clearedThrough: runId => clearedThroughIds.get(runId) ?? 0,
		clearThrough: (runId, logId) => {
			clearedThroughIds.set(runId, Math.max(logId, clearedThroughIds.get(runId) ?? 0))
		}
	}
}

export const tickActionLogClearState = createTickActionLogClearState()

export function tickActionPollDelay(statuses: readonly string[]): number {
	return statuses.some(status => status === 'running' || status === 'stopping') ? 100 : 10_000
}

export function tickActionLogBatchDelay(pollMs: number, count: number): number {
	return Math.max(1, Math.floor(pollMs / Math.max(1, count)))
}

export function nextTickActionLogAfterId<T extends { id: number }>(
	currentAfterId: number,
	incoming: readonly T[],
	requestedClearVersion: number,
	currentClearVersion: number
): number | null {
	if (requestedClearVersion !== currentClearVersion) return null
	return Math.max(currentAfterId, ...incoming.map(log => log.id))
}

export function filterTickActionLogs<T extends { level: string }>(
	logs: readonly T[],
	levels: ReadonlySet<string>
): T[] {
	return levels.size === 0 ? [...logs] : logs.filter(log => levels.has(log.level))
}

export function tickActionLogCounts<T extends { level: string }>(logs: readonly T[]) {
	const counts = { all: logs.length, general: 0, warning: 0, error: 0 }

	for (const log of logs) {
		if (log.level === 'general' || log.level === 'warning' || log.level === 'error') {
			counts[log.level] += 1
		}
	}

	return counts
}

export function mergeTickActionLogs<T extends { id: number }>(
	current: readonly T[],
	incoming: readonly T[],
	limit = tickActionLogLimit
): T[] {
	const byId = new Map(current.map(log => [log.id, log]))
	for (const log of incoming) { byId.set(log.id, log) }
	return [...byId.values()].sort((left, right) => right.id - left.id).slice(0, limit)
}

export function tickActionLogCue(level: string): 'info' | 'warning' | 'error' {
	return level === 'warning' || level === 'error' ? level : 'info'
}
