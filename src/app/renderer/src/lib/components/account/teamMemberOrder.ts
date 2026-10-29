export function mergeTeamMembers<T extends { userId: number }>(current: T[], incoming: T[]): T[] {
	const incomingById = new Map(incoming.map(member => [member.userId, member]))
	const currentIds = new Set(current.map(member => member.userId))

	return [
		...current.flatMap(member => {
			const updated = incomingById.get(member.userId)
			return updated ? [updated] : []
		}),
		...incoming.filter(member => !currentIds.has(member.userId)),
	]
}
