<script lang="ts">
	import { resolveIconColor } from "$lib/utils/tones"

	export let name: string;
	export let size: "xs" | "sm" | "md" | "lg" | "xlg" | "xxl" = "md";
	export let tone = "inherit";
	export let type: "solid" | "regular" | "light" | "thin" | "brands" | "duotone" = "light"
</script>

<span
	class={`icon icon--${size}`}
	class:icon--toned={tone !== `inherit`}
	style={`--icon-color: ${resolveIconColor(tone)}`}
	aria-hidden="true"
>
	<i class={`${type === "duotone" ? "fa-duotone fa-solid" : `fa-${type}`} ${name}`}></i>
</span>

<style lang="scss">
	.icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		color: inherit;
		line-height: 1;
		user-select: none;
	}

	.icon--toned { color: var(--icon-color); }

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
