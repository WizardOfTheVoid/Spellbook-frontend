import type { ServerProfileSummary } from '$lib/core'
import { openInfinityMenu, type InfinityMenuLevel } from '$lib/components/ui/infinityMenu'

export type ProfileMenuTarget = {
	summary: ServerProfileSummary
	canDuplicate: boolean
	busy?: boolean
	onOpen: () => void
	onDuplicate: () => void | Promise<void>
	onSetEnabled: (isEnabled: boolean) => void | Promise<void>
}

type MenuEvent = Pick<MouseEvent, `clientX` | `clientY` | `preventDefault` | `stopPropagation`> & {
	currentTarget: EventTarget | null
}

export function createProfileMenu(target: ProfileMenuTarget): InfinityMenuLevel {
	const { profile } = target.summary
	const enabled = target.summary.isEnabledForUser !== false
	const items = [
		{
			name: `Open`,
			icon: `fa-folder-open`,
			action: target.onOpen,
		},
		{
			name: `Duplicate`,
			icon: `fa-copy`,
			disabled: Boolean(target.busy || !target.canDuplicate),
			action: target.onDuplicate,
		},
	]

	if (!profile.isDefault) {
		items.push({
			name: enabled ? `Disable for me` : `Enable for me`,
			icon: enabled ? `fa-eye-slash` : `fa-eye`,
			disabled: Boolean(target.busy),
			action: () => target.onSetEnabled(!enabled),
		})
	}

	return { name: profile.name, icon: `fa-layer-group`, items }
}

export function openProfileMenu(event: MenuEvent, target: ProfileMenuTarget): void {
	event.preventDefault()
	event.stopPropagation()
	const candidate = event.currentTarget as HTMLElement | null
	const trigger = candidate && typeof candidate.getBoundingClientRect === `function` ? candidate : null
	const owner = trigger?.closest<HTMLElement>(`[data-profile-summary]`) ?? trigger
	const rect = trigger?.getBoundingClientRect()
	const anchored = owner !== trigger || event.clientX === 0 && event.clientY === 0
	openInfinityMenu(createProfileMenu(target), {
		x: anchored && rect ? rect.right : event.clientX,
		y: anchored && rect ? rect.bottom : event.clientY,
	}, owner)
}
