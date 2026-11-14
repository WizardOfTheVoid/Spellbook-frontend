<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte'
	import AvatarUser from '$lib/components/ui/avatars/avatarUser.svelte'

	export let name: string
	export let type: `light` | `brands` = `light`
	export let size: `sm` | `lg` = `sm`
	export let avatarUrl: string | null = null
	export let avatarName: string | null = null
</script>

{#if avatarUrl}
	<AvatarUser src={avatarUrl} name={avatarName || `Sender`} size={size === `sm` ? `sm` : 45} fallbackIcon={name} fallbackType={type} fallbackTone="inherit" />
{:else}
	<Icon {name} {type} {size} />
{/if}
