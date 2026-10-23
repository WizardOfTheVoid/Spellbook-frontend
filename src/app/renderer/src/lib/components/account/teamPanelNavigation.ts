export type TeamNavigationPorts = {
	isLoaded(): boolean
	load(): Promise<void>
	hasTeam(teamId: number): boolean
	select(teamId: number | null): Promise<void | boolean>
	isCurrent?(): boolean
}

export async function applyTeamNavigationRequest(
	teamId: number | null,
	ports: TeamNavigationPorts,
): Promise<boolean> {
	if (!ports.isLoaded()) await ports.load()
	if (ports.isCurrent && !ports.isCurrent()) return false
	if (teamId !== null && !ports.hasTeam(teamId)) throw new Error(`Team ${teamId} was not found.`)
	return await ports.select(teamId) !== false
}

export function createTeamSelection() {
  let generation = 0
  return {
    cancel: () => { generation++ },
    async run<T>(load: () => Promise<T | null>, commit: (value: T) => void, isCurrent: () => boolean = () => true): Promise<boolean> {
      const request = ++generation
      const value = await load()
      if (value === null || request !== generation || !isCurrent()) return false
      commit(value)
      return true
    }
  }
}
