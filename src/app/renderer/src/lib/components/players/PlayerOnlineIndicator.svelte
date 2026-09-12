<script lang="ts">
	import type { PlayerPresence } from '@spellbook/shared/playerPresence.js'
	import { authState } from '$lib/auth/user'
	import { playerPresenceTooltip } from '$lib/utils/playerPresenceTooltip'

	export let playfabId: string | null = null
	export let presence: PlayerPresence | null | undefined = undefined
	export let tooltipOnParent = false

	const attachTooltip: typeof playerPresenceTooltip = (node, options) =>
		tooltipOnParent ? undefined : playerPresenceTooltip(node, options)
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<span
	class="player-online-indicator"
	aria-label="Online now"
	role="img"
	tabindex="0"
	use:attachTooltip={{ playfabId, presence, viewer: $authState.user }}
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
