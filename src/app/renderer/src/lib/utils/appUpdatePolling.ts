type UpdateTimers = {
	setInterval(callback: () => void, milliseconds: number): number
	clearInterval(id: number): void
}

const updatePollMs = 15 * 60 * 1000

export function startAppUpdatePolling(
	check: () => Promise<string | null>,
	publish: (version: string | null) => void,
	timers: UpdateTimers = window,
): () => void {
	const refresh = async (): Promise<void> => {
		try {
			publish(await check())
		} catch {
			// Update discovery is optional and must not interrupt the overlay.
		}
	}

	void refresh()
	const intervalId = timers.setInterval(() => void refresh(), updatePollMs)
	return () => timers.clearInterval(intervalId)
}
