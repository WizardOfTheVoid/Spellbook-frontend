<script lang="ts">
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
</script>

<slot />
{#if $creditsRequest}
	<CreditsOverlay returnFocus={$creditsRequest.returnFocus} onClose={closeCredits} />
{/if}
<InfinityMenu />
{#if $unsavedChangesPrompt}
	<UnsavedChangesModal prompt={$unsavedChangesPrompt} />
{/if}
<NotificationStack />
<TooltipLayer />
