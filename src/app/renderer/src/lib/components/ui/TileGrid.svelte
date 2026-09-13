<script lang="ts">
	export let columns: 1 | 2 | 3 = 2;
</script>

<div class={`tile-grid tile-grid--${columns}`}>
	<slot />
</div>

<style lang="scss">
	.tile-grid {
		display: grid;
		gap: var(--gutter-md);
	}

	.tile-grid--2 {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.tile-grid--3 {
		grid-template-columns: repeat(3, minmax(0, 1fr));
	}
</style>
