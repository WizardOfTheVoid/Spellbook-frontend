import type { ChivServerApi } from '$lib/core'

type AuthenticatedCacheApi = {
	profileOwners: ChivServerApi['profileOwners']
	teams: Pick<ChivServerApi['teams'], 'list'>
}

export async function warmAuthenticatedCaches(api: AuthenticatedCacheApi): Promise<void> {
	await Promise.allSettled([
		Promise.resolve().then(() => api.teams.list()),
		Promise.resolve().then(() => api.profileOwners()),
	])
}
