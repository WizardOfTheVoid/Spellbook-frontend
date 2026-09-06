<script lang="ts">
	import type { ControlSize, Tone } from "$lib/types/tone";
	// import { toneStyle } from "$lib/utils/tones";

	export let name: string;
	export let size: "xs" | "sm" | "md" | "lg" | "xlg" | "xxl" = "md";
	export let tone = "inherit";
	export let type: "solid" | "regular" | "light" | "thin" | "brands" = "light"
</script>

<span
	class={`icon icon--${size}`}
	style={`--tone: ${tone};`}
	aria-hidden="true"
>
	<i class={`fa-${type} ${name}`}></i>
</span>

<style lang="scss">
	.icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		color: var(--tone);
		line-height: 1;
		user-select: none;
	}

	.icon--xs {
		font-size: var(--icon-size-sm);
	}

	.icon--sm {
		font-size: var(--icon-size-md);
	}

	.icon--md {
		font-size: var(--icon-size-lg);
	}

	.icon--lg {
		font-size: var(--icon-size-xlg);
	}

	.icon--xlg {
		font-size: var(--icon-size-xxl);
	}
</style>
