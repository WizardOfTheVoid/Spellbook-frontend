<script lang="ts">
	import type { LoadState } from "$lib/types/ui";
</script>

<section class="ambient-stage" aria-hidden="true"></section>

<style lang="scss">
	.ambient-stage {
		position: relative;
		z-index: 1;
		min-width: 0;
		min-height: 0;
		pointer-events: none;
	}
</style>
