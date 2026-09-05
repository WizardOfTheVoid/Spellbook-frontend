import type { UserSession } from "$lib/core"
import type { ActivePage } from "$lib/types/ui"
import { openInfinityMenu } from "../ui/infinityMenu"

export type AccountInfinityMenuTarget = {
	user: UserSession
	onSelectPage: (page: ActivePage) => void
	onLogout: () => Promise<void>
	onHelp: () => void
}

export function openAccountInfinityMenu(
	event: MouseEvent,
	target: AccountInfinityMenuTarget,
): void {
	event.preventDefault()
	event.stopPropagation()

	openInfinityMenu({
		name: target.user.displayName,
		icon: `fa-user`,
		items: [
			{
				name: `Profile`,
				icon: `fa-user`,
				action: () => target.onSelectPage(`account`),
			},
			{
				name: `Settings`,
				icon: `fa-gear`,
				action: () => target.onSelectPage(`settings`),
			},
			{
				name: `My teams`,
				icon: `fa-users-gear`,
				action: () => target.onSelectPage(`teams`),
			},
			{
				name: `Help`,
				icon: `fa-circle-question`,
				action: target.onHelp,
			},
			{
				name: `Logout`,
				icon: `fa-arrow-right-from-bracket`,
				action: target.onLogout,
			},
		],
	}, {
		x: event.clientX,
		y: event.clientY,
	}, event.currentTarget as HTMLElement | null)
}
