<script lang="ts">
	import { onMount, onDestroy } from 'svelte'
	import { authState } from '$lib/auth/user'
	import { getServerApi } from '$lib/core'
	import { unsavedChanges } from '$lib/utils/unsavedChanges'
	import { notifySuccess } from '$lib/notifications/notificationEvents'
	import Button from '$lib/components/ui/Button.svelte'
	import Input from '$lib/components/ui/Input.svelte'
	import Textarea from '$lib/components/ui/Textarea.svelte'
	import ConfirmModal from '$lib/components/ui/ConfirmModal.svelte'
	import { createMaintenanceEditor } from './maintenanceEditor'

	const editor = createMaintenanceEditor(getServerApi().maintenance)
	let confirming = false
	let textElement: HTMLTextAreaElement
	$: busy = $editor.loading || $editor.saving
	const unregister = unsavedChanges.register(editor.dirty)
	onMount(() => { if ($authState.user?.isSuperadmin) void editor.load() })
	onDestroy(() => {
		unregister()
		editor.destroy()
	})
	async function save(enabled = $editor.draft.enabled) {
		confirming = false
		if (await editor.save(enabled)) notifySuccess(`Maintenance settings saved.`)
	}
	async function reload() {
		if (await unsavedChanges.canLeave()) await editor.load(true)
	}
</script>

{#if $authState.user?.isSuperadmin}
	<section class="maintenance-editor" aria-label="Maintenance settings">
		<p>Maintenance is <strong>{$editor.saved?.enabled ? `enabled` : `disabled`}</strong>. Normal use and new game commands pause for every account. Superadmins retain Admin access.</p>
		{#if $editor.error}<p role="alert">{$editor.error}</p>{/if}
		{#if $editor.conflict}<p role="status">Another admin changed these settings. Your draft is preserved. Reload the saved settings before making another change.</p>{/if}
		<Input label="Title" value={$editor.draft.title} disabled={busy} hint={`${[...$editor.draft.title].length}/120 characters`} onChange={title => editor.edit({ title })} />
		<Textarea label="Text" bind:element={textElement} value={$editor.draft.text} disabled={busy} rows={6} hint={`${[...$editor.draft.text].length}/2,000 characters. Plain text; line breaks are preserved.`} onChange={text => editor.edit({ text })} />
		<div class="maintenance-editor__preview" aria-label="Notice preview"><h2>{$editor.draft.title}</h2><p>{$editor.draft.text}</p></div>
		<div class="maintenance-editor__actions">
			<Button label={$editor.saving ? `Saving…` : `Save text`} disabled={busy || !$editor.saved || $editor.conflict} onClick={() => void save()} />
			{#if $editor.saved?.enabled}
				<Button label="Disable maintenance" variant="primary" disabled={busy || $editor.conflict} onClick={() => void save(false)} />
			{:else}
				<Button label="Enable maintenance" variant="danger" disabled={busy || !$editor.saved || $editor.conflict} onClick={() => confirming = true} />
			{/if}
			<Button label="Reload saved settings" disabled={busy} onClick={() => void reload()} />
		</div>
		{#if $editor.saved}<small>Revision {$editor.saved.revision} · Updated {$editor.saved.updatedAt}</small>{/if}
	</section>
	{#if confirming}<ConfirmModal title="Enable maintenance?" message="This blocks normal SpellBook use and pauses new game commands for everyone. Superadmins can use Admin to reopen SpellBook." confirmLabel="Enable maintenance" cancelLabel="Cancel" busyLabel="Saving…" icon="fa-screwdriver-wrench" iconType="light" onConfirm={() => void save(true)} onCancel={() => confirming = false} />{/if}
{/if}

<style lang="scss">
	.maintenance-editor { display: grid; gap: var(--gutter-lg); padding: var(--gutter-lg); }
	.maintenance-editor__actions { display: flex; flex-wrap: wrap; gap: var(--gutter-sm); }
	.maintenance-editor__preview { padding: var(--gutter-lg); border: 1px solid var(--color-dark-secondary); border-radius: var(--radius); }
	.maintenance-editor__preview p { white-space: pre-wrap; overflow-wrap: anywhere; }
</style>
