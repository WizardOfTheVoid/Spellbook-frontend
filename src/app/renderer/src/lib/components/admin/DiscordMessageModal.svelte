<script lang="ts">
	import { onMount } from 'svelte'
	import type { DiscordBroadcastGuild, DiscordBroadcastResult, DiscordReleasePreview } from '@spellbook/shared/discordBroadcasts.js'
	import ConfirmModal from '$lib/components/ui/ConfirmModal.svelte'
	import Input from '$lib/components/ui/Input.svelte'
	import Textarea from '$lib/components/ui/Textarea.svelte'
	import Select from '$lib/components/ui/Select.svelte'
	import Button from '$lib/components/ui/Button.svelte'
	import { notifySuccess, notifyInfo } from '$lib/notifications/notificationEvents'
	import { unwrap } from '$lib/utils/apiResult'
	import { discordQueueMessage, type DiscordMessageMode } from './discordMessages'

	export let mode: DiscordMessageMode
	export let onClose: () => void

	let guilds: DiscordBroadcastGuild[] = []
	let release: DiscordReleasePreview | null = null
	let guildId = ``
	let title = ``
	let description = ``
	let messageInput: HTMLTextAreaElement
	let loading = true
	let busy = false
	let error = ``
	let loaded = false

	$: heading = mode === `targeted` ? `Send a Discord message` : mode === `release` ? `Broadcast latest version` : `Broadcast a message`
	$: valid = loaded && guilds.length > 0 && (mode === `release` ? !!release : !!title.trim() && !!description.trim())
		&& (mode !== `targeted` || guilds.some(guild => guild.guildId === guildId))

	onMount(() => { void load() })

	async function load(): Promise<void> {
		loading = true
		loaded = false
		error = ``
		release = null
		try {
			guilds = await unwrap<DiscordBroadcastGuild[]>(await window.chivServer.admin.discord.guilds(), `Could not load Discord servers.`)
			if (mode === `release`) release = await unwrap<DiscordReleasePreview>(await window.chivServer.admin.discord.latestRelease(), `Could not load the latest release.`)
			loaded = true
		} catch (value) {
			error = value instanceof Error ? value.message : `Could not load Discord details.`
		} finally {
			loading = false
		}
	}

	async function send(): Promise<void> {
		if (!valid || busy || loading) return
		busy = true
		error = ``
		try {
			const api = window.chivServer.admin.discord
			const message = { title: title.trim(), description: description.trim() }
			const response = mode === `release` && release ? await api.broadcastRelease(release.version)
				: mode === `targeted` ? await api.send({ ...message, guildId }) : await api.broadcast(message)
			const result = await unwrap<DiscordBroadcastResult>(response, `Could not queue the Discord message.`)
			if (result.targets > 0) notifySuccess(discordQueueMessage(result))
			else notifyInfo(discordQueueMessage(result))
			onClose()
		} catch (value) {
			error = value instanceof Error ? value.message : `Could not queue the Discord message.`
		} finally {
			busy = false
		}
	}
</script>

<ConfirmModal title={heading} message={mode === `targeted` ? `Send to the selected server’s updates channel.` : `Send to every connected server with an updates channel configured.`}
	confirmLabel={mode === `targeted` ? `Send message` : `Broadcast to all`} confirmTone="primary" cancelLabel="Cancel" busyLabel="Queuing..."
	{busy} confirmDisabled={loading || !valid} manageOverlayState onConfirm={() => void send()} onCancel={onClose}>
	{#if loading}
		<p role="status">{mode === `release` ? `Loading latest release...` : `Loading Discord servers...`}</p>
	{:else if loaded}
		{#if guilds.length === 0}
			<p role="status">No Discord servers are configured to receive updates.</p>
		{:else if mode === `targeted`}
			<Select label="Discord server" value={guildId} options={guilds.map(guild => ({ value: guild.guildId, label: `${guild.name} (${guild.guildId})` }))} placeholder="Choose a Discord server" disabled={busy} inlineMenu onChange={value => guildId = value} />
		{:else}
			<p class="recipients">Recipients: {guilds.length} Discord server{guilds.length === 1 ? `` : `s`}</p>
		{/if}
		{#if mode === `release` && release}
			<div class="release-preview">
				<strong>{release.payload.title}</strong>
				<p>{release.payload.description}</p>
				<span>{release.payload.url}</span>
				{#each release.payload.fields ?? [] as field}<p><strong>{field.name}</strong><br />{field.value}</p>{/each}
			</div>
		{:else if mode !== `release`}
			<Input label="Title" value={title} maxlength={256} required disabled={busy} placeholder="Message title" onChange={value => title = value} />
			<Textarea label="Message" value={description} bind:element={messageInput} maxlength={4096} required disabled={busy} placeholder="Write your message..." onChange={value => description = value} />
		{/if}
	{/if}
	{#if error}<p class="error" role="alert">{error}</p>{/if}
	{#if !loading && (error || guilds.length === 0)}<Button label="Reload details" icon="fa-rotate" disabled={busy} onClick={() => void load()} />{/if}
</ConfirmModal>

<style lang="scss">
	p { margin: 0; }
	.recipients { color: var(--color-light-secondary); }
	.release-preview { display: grid; gap: var(--gutter-md); padding: var(--gutter-md); border: 1px solid var(--color-dark-tertiary); border-radius: var(--radius); overflow-wrap: anywhere; }
	.release-preview p { white-space: pre-wrap; max-height: 240px; overflow: auto; }
	.release-preview span { font-size: var(--font-size-xs); color: var(--color-light-secondary); }
	.error { color: var(--color-accent-quaternary); }
</style>
