<script lang="ts">
</script>

<div class="wanted-ambient" aria-hidden="true"></div>

<style lang="scss">
	.wanted-ambient {
		position: absolute;
		inset: 0;
		z-index: 0;
		background: linear-gradient(
			180deg,
			rgbaa(var(--color-accent-quaternary), 1),
			rgbaa(var(--color-accent-quaternary), 0)
		);
		opacity: 0.1;
		mix-blend-mode: screen;
		pointer-events: none;
	}
</style>
