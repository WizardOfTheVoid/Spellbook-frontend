import { getAdminName } from "@spellbook/shared/adminName.js"
import type { UserSession } from "$lib/core"
import type { ActivePage } from "$lib/types/ui"
import { openInfinityMenu } from "../ui/infinityMenu"
import type { HelpView } from "./helpNotice"

export type AccountInfinityMenuTarget = {
	user: UserSession
	onSelectPage: (page: ActivePage) => void
	onLogout: () => Promise<void>
	onHelp: (view: HelpView) => void
	onCredits: () => void
}

export function openAccountInfinityMenu(
	event: MouseEvent,
	target: AccountInfinityMenuTarget,
): void {
	event.preventDefault()
	event.stopPropagation()

	openInfinityMenu({
		name: getAdminName(target.user),
		icon: `fa-user`,
		placement: `bottom`,
		items: [
			{
				name: `Profile`,
				icon: `fa-user`,
				action: () => target.onSelectPage(`account`),
			},
			...(target.user.isSuperadmin ? [{
				name: `Admin`,
				icon: `fa-shield-halved`,
				action: () => target.onSelectPage(`admin`),
			}] : []),
			{
				name: `Onboarding`,
				icon: `fa-list-check`,
				action: () => target.onHelp(`onboarding`),
			},
			{
				name: `Credits`,
				icon: `fa-film`,
				action: target.onCredits,
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
