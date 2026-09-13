<script lang="ts">
	import { onMount } from 'svelte'
	import type { AdminNotificationAudience, AdminNotificationInput, AdminNotificationResult } from '@spellbook/shared/notifications.js'
	import type { AdminTeamSummary, AdminUserRecord } from '$lib/core'
	import type { FormOption } from '$lib/types/ui'
	import ConfirmModal from '$lib/components/ui/ConfirmModal.svelte'
	import Input from '$lib/components/ui/Input.svelte'
	import Textarea from '$lib/components/ui/Textarea.svelte'
	import MultiSelect from '$lib/components/ui/MultiSelect.svelte'
	import Button from '$lib/components/ui/Button.svelte'
	import { notifySuccess } from '$lib/notifications/notificationEvents'
	import { unwrap } from '$lib/utils/apiResult'

	export let audience: AdminNotificationAudience
	export let onClose: () => void

	let title = ``
	let description = ``
	let messageInput: HTMLTextAreaElement
	let options: FormOption[] = []
	let recipientIds: string[] = []
	let loading = audience !== `everyone`
	let loaded = audience === `everyone`
	let busy = false
	let error = ``

	$: recipientLabel = audience === `users` ? `Users` : `Teams`
	$: heading = audience === `everyone` ? `Send a custom notification to everyone`
		: audience === `users` ? `Send a custom notification to specific users` : `Send a custom notification to teams`
	$: valid = loaded && !!title.trim() && !!description.trim()
		&& (audience === `everyone` || recipientIds.length > 0)

	onMount(() => { if (audience !== `everyone`) void loadRecipients() })

	async function loadRecipients(): Promise<void> {
		loading = true
		loaded = false
		error = ``
		try {
			const choices: FormOption[] = []
			if (audience === `users`) {
				const limit = 200
				let offset = 0
				while (true) {
					const users = await unwrap<AdminUserRecord[]>(await window.chivServer.admin.users.list({ limit, offset }), `Could not load users.`)
					choices.push(...users.map(user => ({ value: `${user.id}`, label: user.displayName || user.username, description: `@${user.username}` })))
					if (users.length < limit) break
					offset += users.length
				}
			} else {
				const teams = await unwrap<AdminTeamSummary[]>(await window.chivServer.admin.teams.list(), `Could not load teams.`)
				choices.push(...teams.map(team => ({ value: `${team.id}`, label: team.name, description: `Owner: ${team.ownerDisplayName}` })))
			}
			options = choices.sort((left, right) => left.label.localeCompare(right.label))
			recipientIds = recipientIds.filter(id => options.some(option => option.value === id))
			loaded = true
		} catch (value) {
			error = value instanceof Error ? value.message : `Could not load recipients.`
		} finally {
			loading = false
		}
	}

	async function send(): Promise<void> {
		if (!valid || busy || loading) return
		busy = true
		error = ``
		try {
			const message = { title: title.trim(), description: description.trim() }
			const input: AdminNotificationInput = audience === `everyone` ? { ...message, audience }
				: { ...message, audience, recipientIds: recipientIds.map(Number) }
			const result = await unwrap<AdminNotificationResult>(await window.chivServer.admin.notifications.send(input), `Could not send the notification.`)
			notifySuccess(`Notification sent to ${result.recipientCount} user${result.recipientCount === 1 ? `` : `s`}.`)
			onClose()
		} catch (value) {
			error = value instanceof Error ? value.message : `Could not send the notification.`
		} finally {
			busy = false
		}
	}
</script>

<ConfirmModal
	title={heading}
	message={audience === `everyone` ? `Send to every user's notification inbox, including your own.`
		: audience === `users` ? `Send to the selected users' notification inboxes.`
		: `Send to all owners and members of the selected teams. Each person receives it once.`}
	icon="fa-bell" iconType="light"
	confirmLabel="Send notification" confirmTone="primary" cancelLabel="Cancel" busyLabel="Sending..."
	{busy} confirmDisabled={loading || !valid} manageOverlayState onConfirm={() => void send()} onCancel={onClose}
>
	{#if audience !== `everyone`}
		{#if loading}
			<p role="status">Loading {recipientLabel.toLowerCase()}...</p>
		{:else if loaded}
			{#if options.length > 0}
				<MultiSelect label={recipientLabel} {options} value={recipientIds} placeholder={`Choose ${recipientLabel.toLowerCase()}`} disabled={busy} onChange={value => recipientIds = value} />
			{:else}
				<p role="status">No {recipientLabel.toLowerCase()} are available.</p>
			{/if}
		{/if}
	{/if}
	<Input label="Title" value={title} maxlength={255} required disabled={busy} placeholder="Notification title" onChange={value => title = value} />
	<Textarea label="Message" value={description} bind:element={messageInput} maxlength={4000} required disabled={busy} placeholder="Write your notification..." onChange={value => description = value} />
	{#if error}<p class="error" role="alert">{error}</p>{/if}
	{#if audience !== `everyone` && !loading && (error || options.length === 0)}
		<Button label={`Reload ${recipientLabel.toLowerCase()}`} icon="fa-rotate" disabled={busy} onClick={() => void loadRecipients()} />
	{/if}
</ConfirmModal>

<style lang="scss">
	p { margin: 0; color: var(--color-light-secondary); }
	.error { color: var(--color-accent-quaternary); }
</style>
