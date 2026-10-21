<script lang="ts">
	import { onMount } from 'svelte'
	import { maintenanceSession, maintenanceAdminOpen } from '$lib/maintenance/maintenanceSession'
	import { maintenanceOperational } from '../../../shared/maintenance'
	import { closeInfinityMenu } from '$lib/components/ui/infinityMenu'
	import { tooltipState } from '$lib/utils/tooltip'
	import CreditsOverlay from "$lib/components/credits/creditsOverlay.svelte"
	import { creditsRequest, closeCredits } from "$lib/components/credits/credits"
	import "$lib/diagnostics/startRendererLogging"
	import NotificationStack from "$lib/components/app/NotificationStack.svelte";
	import TooltipLayer from "$lib/components/app/TooltipLayer.svelte";
	import InfinityMenu from "$lib/components/ui/InfinityMenu.svelte"
	import UnsavedChangesModal from "$lib/components/app/UnsavedChangesModal.svelte"
	import { unsavedChangesPrompt } from "$lib/utils/unsavedChanges"
	import "$lib/global/sfx";
	import "../styles/style.scss";
	let operational = false
	$: nextOperational = maintenanceOperational($maintenanceSession)
	$: if (operational !== nextOperational) {
		operational = nextOperational
		if (!operational) {
			closeCredits()
			closeInfinityMenu()
			tooltipState.set(null)
			$unsavedChangesPrompt?.respond(false)
		}
	}
	onMount(() => {
		if (window.chivServer?.maintenance) return maintenanceSession.start(window.chivServer.maintenance)
	})
</script>

<slot />
{#if operational && $creditsRequest}
	<CreditsOverlay returnFocus={$creditsRequest.returnFocus} onClose={closeCredits} />
{/if}
{#if operational}<InfinityMenu />{/if}
{#if (operational || $maintenanceAdminOpen) && $unsavedChangesPrompt}
	<UnsavedChangesModal prompt={$unsavedChangesPrompt} />
{/if}
{#if operational}<NotificationStack /><TooltipLayer />{/if}
