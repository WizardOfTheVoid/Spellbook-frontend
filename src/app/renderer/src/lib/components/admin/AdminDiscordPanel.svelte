<script lang="ts">
	import Tile from '$lib/components/ui/Tile.svelte'
	import TileGrid from '$lib/components/ui/TileGrid.svelte'
	import DiscordMessageModal from './DiscordMessageModal.svelte'
	import type { DiscordMessageMode } from './discordMessages'

	let mode: DiscordMessageMode | null = null
	export let onOpenQueue: () => void
</script>

<TileGrid columns={1}>
	<Tile title="Message queues" subtitle="Inspect queued messages, delivery status and errors" icon="fa-list-check" onClick={onOpenQueue} />
	<Tile title="Broadcast a message to all discords" subtitle="Compose a message for every connected Discord server" icon="fa-bullhorn" iconTone="accent" onClick={() => mode = `broadcast`} />
	<Tile title="Broadcast the latest available version to all discords" subtitle="Preview and announce the latest published SpellBook release" icon="fa-cloud-arrow-down" iconTone="accent" onClick={() => mode = `release`} />
	<Tile title="Send a message to a specified discord" subtitle="Choose a connected Discord server and compose a message" icon="fa-discord" iconType="brands" iconTone="accent" onClick={() => mode = `targeted`} />
</TileGrid>

{#if mode}
	<DiscordMessageModal {mode} onClose={() => mode = null} />
{/if}
