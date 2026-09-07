export type TeamNavigationPorts = {
	isLoaded(): boolean
	load(): Promise<void>
	hasTeam(teamId: number): boolean
	select(teamId: number): Promise<void>
}

export async function applyTeamNavigationRequest(
	teamId: number,
	ports: TeamNavigationPorts,
): Promise<void> {
	if (!ports.isLoaded()) await ports.load()
	if (!ports.hasTeam(teamId)) throw new Error(`Team ${teamId} was not found.`)
	await ports.select(teamId)
}
