<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte'

	export let name: string
	export let type: `light` | `brands` = `light`
	export let size: `sm` | `lg` = `sm`
	export let avatarUrl: string | null = null
	export let avatarName: string | null = null
	let failedUrl: string | null = null
</script>

{#if avatarUrl && avatarUrl !== failedUrl}
	<img class:small={size === `sm`} src={avatarUrl} alt={`${avatarName || `Sender`}'s avatar`} on:error={() => failedUrl = avatarUrl} />
{:else}
	<Icon {name} {type} {size} />
{/if}

<style lang="scss">
	img { width: var(--control-height-md); height: var(--control-height-md); display: block; margin: 0 auto; border-radius: 50%; object-fit: cover; }
	img.small { width: 28px; height: 28px; }
</style>
