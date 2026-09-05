<script lang="ts">
	import { tooltip as tooltipAction } from "$lib/utils/tooltip"
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<span
	class="player-online-indicator"
	aria-label="Online now"
	role="img"
	tabindex="0"
	use:tooltipAction={`Online now`}
></span>

<style lang="scss">
	.player-online-indicator {
		width: 8px;
		height: 8px;
		flex: 0 0 auto;
		border-radius: 50%;
		background: var(--color-accent-secondary);
		box-shadow: 0 0 10px rgbaa(var(--color-accent-secondary), 0.8);
		animation: player-online-pulse 1.8s ease-in-out infinite;
	}

	@keyframes player-online-pulse {
		50% {
			transform: scale(1.3);
			opacity: 0.65;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.player-online-indicator {
			animation: none;
		}
	}
</style>
