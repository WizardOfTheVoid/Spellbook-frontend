<script lang="ts">
</script>

<div class="sentinel-border-1" aria-hidden="true"></div>
<div class="sentinel-border-2" aria-hidden="true"></div>

<style lang="scss">
	.sentinel-border-1,
	.sentinel-border-2 {
		--size: 25px;
		--offset: -20px;
		position: fixed;
		box-sizing: border-box;
		pointer-events: none !important;
		user-select: none !important;
	}

	.sentinel-border-1 {
		--size: 22px;
		--offset: -20px;

		inset: var(--offset);
		box-sizing: border-box;
		border: var(--size) solid var(--color-accent-primary);
		border-width: 2cap;
		border-radius: 3cap;

		opacity: 0.7;
		animation: sentinel-opacity 2000ms ease-in-out infinite;
	}

	.sentinel-border-2 {
		inset: var(--offset);

		border: var(--size) solid var(--color-accent-primary);

		filter: blur(50px);
		opacity: 0.7;
		animation: sentinel-pulse 3000ms ease-in-out infinite;
	}

	@keyframes sentinel-opacity {
		50% {
			opacity: 0.5;
		}
	}

	@keyframes sentinel-pulse {
		50% {
			opacity: 0.5;
			transform: scale(1.025);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.sentinel-border-1,
		.sentinel-border-2 {
			animation: none;
		}
	}
</style>
