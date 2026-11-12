import type { ActivePage } from "$lib/types/ui"

export type NavEntry = {
	page: ActivePage
	label: string
	icon: string
	badge?: number
}

export function createNavigationEntries(
	isSuperadmin: boolean,
	notificationCount: number,
	pendingRequestCount = 0,
	contentAllowed = false,
): NavEntry[] {
	const entries: NavEntry[] = [
		{ page: "dashboard", label: "Dashboard", icon: "fa-chart-line" },
		{ page: `server`, label: `Game Server`, icon: `fa-gamepad` },
		{ page: "wanted", label: "Wanted", icon: "fa-crosshairs" },
		{ page: "players", label: "Players", icon: "fa-users" },
		{ page: `servers`, label: `Server browser`, icon: `fa-server` },
		{ page: "profiles", label: "Profiles", icon: "fa-layer-group" },
		{
			page: `teams`,
			label: `My teams`,
			icon: `fa-users-gear`,
			...navigationBadge(pendingRequestCount),
		},
		{
			page: "notifications",
			label: "Notifications",
			icon: "fa-bell",
			...navigationBadge(notificationCount),
		},
	]

	if (isSuperadmin || contentAllowed) entries.push({ page: `content`, label: `Content`, icon: `fa-newspaper` })
	return isSuperadmin
		? [...entries, { page: "admin", label: "Admin", icon: "fa-shield-halved" }]
		: entries
}

function navigationBadge(count: number): { badge?: number } {
	return Number.isFinite(count) && count >= 1 ? { badge: Math.trunc(count) } : {}
}
