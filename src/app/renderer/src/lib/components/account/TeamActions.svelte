<script lang="ts">
	import { onDestroy } from "svelte"
	import type { TeamRecord } from "$lib/core"
	import IconButton from "$lib/components/ui/IconButton.svelte"
	import { closeInfinityMenu, infinityMenuState, openInfinityMenu, type InfinityMenuItem } from "$lib/components/ui/infinityMenu"
	import DeleteTeamButton from "./DeleteTeamButton.svelte"
	import TeamManagementModal from "./TeamManagementModal.svelte"

	export let team: TeamRecord
	export let canManage: boolean
	export let canTransfer: boolean
	export let busy = false
	export let onChanged: () => Promise<void>
	export let onDeleted: (teamId: number) => Promise<void>

	let deletion: DeleteTeamButton
	let trigger: HTMLButtonElement | null = null
	let modal: { mode: `rename` | `ownership`, team: TeamRecord } | null = null
	$: expanded = Boolean(trigger && $infinityMenuState?.owner === trigger)
	onDestroy(() => { if (expanded) closeInfinityMenu() })

	function open(event: MouseEvent): void {
		event.stopPropagation()
		if (expanded) { closeInfinityMenu()
			return }
		trigger = event.currentTarget as HTMLButtonElement
		const target = { ...team }
		const items: InfinityMenuItem[] = []
		if (canManage) items.push({ name: `Rename team`, icon: `fa-pen`, action: () => { modal = { mode: `rename`, team: target } } })
		if (canTransfer) items.push({ name: `Change ownership`, icon: `fa-user-crown`, action: () => { modal = { mode: `ownership`, team: target } } })
		if (canManage) items.push({ name: `Delete team`, icon: `fa-trash`, action: () => deletion.open(trigger) })
		openInfinityMenu({ name: target.name, icon: `fa-users`, items }, { x: event.clientX, y: event.clientY }, trigger)
	}
</script>

<IconButton icon="fa-ellipsis-vertical" ariaLabel="Team actions" tooltip="Team actions" {expanded} disabled={busy} onClick={open} />
<DeleteTeamButton bind:this={deletion} {team} {onDeleted} showButton={false} />
{#if modal}
	<TeamManagementModal team={modal.team} mode={modal.mode} returnFocus={trigger} {onChanged} onClose={() => modal = null} />
{/if}
