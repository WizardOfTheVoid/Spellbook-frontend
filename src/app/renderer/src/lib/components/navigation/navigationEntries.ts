import type { ActivePage } from "$lib/types/ui"

export type NavEntry = {
	page: ActivePage
	label: string
	icon: string
	badge?: number
}

export type UpdateNavEntry = {
	label: string
	icon: string
	tooltip: { text: string, emphasis: string }
}

export function createNavigationEntries(
	isSuperadmin: boolean,
	notificationCount: number,
): NavEntry[] {
	const badge = Number.isFinite(notificationCount) && notificationCount > 0
		? Math.trunc(notificationCount)
		: undefined
	const entries: NavEntry[] = [
		{ page: "dashboard", label: "Dashboard", icon: "fa-chart-line" },
		{ page: "server", label: "Server", icon: "fa-gamepad" },
		{ page: "players", label: "Players", icon: "fa-users" },
		{ page: "wanted", label: "Wanted", icon: "fa-crosshairs" },
		{ page: "servers", label: "Servers", icon: "fa-server" },
		{ page: "profiles", label: "Profiles", icon: "fa-layer-group" },
		{
			page: "notifications",
			label: "Notifications",
			icon: "fa-bell",
			...(badge ? { badge } : {}),
		},
	]

	return isSuperadmin
		? [...entries, { page: "admin", label: "Admin", icon: "fa-shield-halved" }]
		: entries
}

export function createUpdateNavigationEntry(
	currentVersion: string,
	latestVersion: string | null,
): UpdateNavEntry | null {
	return latestVersion ? {
		label: `Update available!`,
		icon: `fa-download`,
		tooltip: {
			text: `v${currentVersion} ->`,
			emphasis: `v${latestVersion}`,
		},
	} : null
}
