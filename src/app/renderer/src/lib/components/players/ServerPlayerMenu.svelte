<script lang="ts">
	import { onDestroy } from "svelte"
	import IconButton from "$lib/components/ui/IconButton.svelte"
	import { closeInfinityMenu, infinityMenuState, openInfinityMenu, type InfinityMenuItem } from "$lib/components/ui/infinityMenu"

	export let active: boolean
	export let teamId: number | null
	export let onOpenTeam: (teamId: number) => void
	export let onOpenSettings: (() => void) | null

	let trigger: HTMLButtonElement | null = null
	$: expanded = Boolean(trigger && $infinityMenuState?.owner === trigger)
	$: if (!active && expanded) closeInfinityMenu()
	onDestroy(() => { if (expanded) closeInfinityMenu() })

	function open(event: MouseEvent): void {
		event.stopPropagation()
		if (expanded) {
			closeInfinityMenu()
			return
		}
		trigger = event.currentTarget as HTMLButtonElement
		const targetTeamId = teamId
		const items: InfinityMenuItem[] = []
		if (targetTeamId) items.push({ name: `Team`, icon: `fa-users`, action: () => onOpenTeam(targetTeamId) })
		items.push({ name: `Settings`, icon: `fa-gear`, action: onOpenSettings ?? undefined, disabled: !onOpenSettings })
		openInfinityMenu({ name: `Server options`, icon: `fa-server`, items }, { x: event.clientX, y: event.clientY }, trigger)
	}
</script>

<IconButton icon="fa-ellipsis-vertical" ariaLabel="Server options" tooltip="Server options" {expanded} onClick={open} />
