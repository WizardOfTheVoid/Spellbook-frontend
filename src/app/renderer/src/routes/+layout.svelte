<script lang="ts">
	import NotificationStack from "$lib/components/app/NotificationStack.svelte";
	import TooltipLayer from "$lib/components/app/TooltipLayer.svelte";
	import InfinityMenu from "$lib/components/ui/InfinityMenu.svelte"
	import "$lib/global/sfx";
	import "../styles/style.scss";
</script>

<slot />
<InfinityMenu />
<NotificationStack />
<TooltipLayer />
