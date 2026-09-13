<script lang="ts">
	import { onMount, tick } from "svelte"
	import type { AdminUserRecord } from "$lib/core"
	import { authState } from "$lib/auth/user"
	import Button from "$lib/components/ui/Button.svelte"
	import Textarea from "$lib/components/ui/Textarea.svelte"
	import { notifySuccess } from "$lib/notifications/notificationEvents"
	import { containModalTab, mountModalEnvironment, ModalStateCoordinator } from "$lib/utils/quickActionUi"
	import { banAdminUser, canBanAdminUser, loadAdminUserBan } from "./adminUserBan"

	export let user: AdminUserRecord
	export let onBanned: (user: AdminUserRecord) => void
	export let onCancel: () => void

	const reasonPresets = [
		{ label: `Abuse`, reason: `Access revoked for abuse.` },
		{ label: `Inactive`, reason: `Access revoked due to inactivity.` },
		{ label: `Ineligible`, reason: `Account does not meet access requirements.` },
		{ label: `Unknown`, reason: `Access revoked by an administrator.` }
	]

	let modalRoot: HTMLDivElement
	let dialog: HTMLDivElement
	let reasonInput: HTMLTextAreaElement
	let reason = ``
	let currentUser: AdminUserRecord | null = null
	let loading = true
	let disposed = false
	let busy = false
	let error = ``
	const modalState = new ModalStateCoordinator(open => window.chivOverlay.setModalOpen(open))

	onMount(() => {
		void loadUser()
		const cleanup = mountModalEnvironment(modalRoot, null)
		void syncModalState(true)
		const stopVisibility = window.chivOverlay.onVisibilityChange(visible => {
			if (!visible && !busy) onCancel()
			void syncModalState(visible)
		})
		const handleKeydown = (event: KeyboardEvent): void => {
			if (event.key === `Escape` && !busy) onCancel()
			containModalTab(event, dialog, document.activeElement)
		}
		window.addEventListener(`keydown`, handleKeydown)
		dialog.focus()
		return () => {
			disposed = true
			window.removeEventListener(`keydown`, handleKeydown)
			stopVisibility()
			void syncModalState(false)
			cleanup()
		}
	})

	async function loadUser(): Promise<void> {
		loading = true
		error = ``
		try {
			const loaded = await loadAdminUserBan(user.id, window.chivServer.admin.users.get)
			currentUser = loaded.user
			reason = loaded.reason
		} catch (value) {
			error = value instanceof Error ? value.message : `User details could not be loaded.`
		} finally {
			loading = false
		}
		await tick()
		if (!disposed && currentUser) reasonInput.focus()
	}

	async function syncModalState(open: boolean): Promise<void> {
		try {
			await modalState.set(open)
		} catch {
			error = `The app could not update the dialog state.`
		}
	}

	async function submit(): Promise<void> {
		if (busy || loading || !currentUser) return
		busy = true
		error = ``
		try {
			await banAdminUser($authState.user, currentUser, reason, window.chivServer.admin.users.ban)
			notifySuccess(`${currentUser.displayName} banned.`)
			onBanned(currentUser)
		} catch (value) {
			error = value instanceof Error ? value.message : `User ban failed.`
		} finally {
			busy = false
		}
	}

	$: identity = currentUser ?? user
</script>

<div class="user-ban" bind:this={modalRoot}>
	<button class="user-ban__backdrop" type="button" aria-label="Cancel ban" tabindex="-1" disabled={busy} on:click={onCancel}></button>
	<div class="user-ban__dialog" bind:this={dialog} role="dialog" aria-modal="true" aria-labelledby="user-ban-title" tabindex="-1">
		<header><h1 id="user-ban-title">Ban user</h1><p>This removes their access to SpellBook.</p></header>
		<div class="user-ban__identity">
			{#if identity.avatarUrl}<img src={identity.avatarUrl} alt="" />{/if}
			<div><strong>{identity.displayName}</strong><span>@{identity.username}</span></div>
		</div>
		<dl>
			<dt>User ID</dt><dd>{identity.id}</dd>
			<dt>Discord ID</dt><dd>{identity.discordId ?? "Not linked"}</dd>
			<dt>PlayFab ID</dt><dd>{identity.playfabId ?? "Not set"}</dd>
		</dl>
		<form on:submit|preventDefault={() => void submit()}>
			{#if loading}<p role="status">Loading current account details...</p>{/if}
			{#if currentUser?.bannedAt}<p class="user-ban__error" role="status">This user is already banned.</p>{/if}
			<Textarea label="Reason for ban" value={reason} bind:element={reasonInput} required maxlength={500} disabled={busy || loading || !currentUser} placeholder="Why are you banning this user?" onChange={value => reason = value} />
			<div class="user-ban__presets" role="group" aria-label="Reason presets">
				{#each reasonPresets as preset}
					<Button label={preset.label} size="sm" disabled={busy || loading || !currentUser} onClick={() => reason = preset.reason} />
				{/each}
			</div>
			{#if error}<p class="user-ban__error" role="alert">{error}</p>{/if}
			<footer>
				<Button label="Cancel" disabled={busy} onClick={onCancel} />
				{#if !loading && !currentUser}
					<Button label="Retry" icon="fa-rotate" onClick={() => void loadUser()} />
				{:else}
					<Button label={busy ? `Banning...` : `Ban user`} icon="fa-ban" variant="danger" disabled={busy || loading || !currentUser || !reason.trim() || !canBanAdminUser($authState.user, currentUser)} onClick={() => void submit()} />
				{/if}
			</footer>
		</form>
	</div>
</div>

<style lang="scss">
	.user-ban { position: fixed; inset: 0; z-index: 40; display: grid; place-items: center; padding: var(--gutter-lg); }
	.user-ban__backdrop { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; border-radius: 0; background: rgba(2, 8, 13, 0.76); }
	.user-ban__dialog { position: relative; width: min(480px, 100%); max-height: calc(100vh - 2 * var(--gutter-lg)); overflow: auto; box-sizing: border-box; display: grid; gap: var(--gutter-md); border: 1px solid var(--color-dark-tertiary); border-radius: var(--radius-xl); padding: var(--gutter-lg); background: rgba(5, 13, 21, 0.98); box-shadow: var(--shadow); }
	header, form { display: grid; gap: var(--gutter-md); }
	h1, p, dl, dd { margin: 0; }
	h1 { font-size: var(--font-size-xl); }
	p, dt, .user-ban__identity span { color: var(--color-light-secondary); }
	.user-ban__identity { display: flex; align-items: center; gap: var(--gutter-md); }
	.user-ban__identity img { width: 48px; height: 48px; border-radius: 50%; object-fit: cover; }
	.user-ban__identity div { display: grid; gap: var(--gutter-sm); overflow-wrap: anywhere; }
	dl { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: var(--gutter-sm) var(--gutter-md); font-size: var(--font-size-sm); }
	dd { overflow-wrap: anywhere; }
	.user-ban__error { color: var(--color-accent-quaternary); }
	.user-ban__presets { display: flex; flex-wrap: wrap; gap: var(--gutter-sm); }
	footer { display: flex; justify-content: flex-end; gap: var(--gutter-sm); }
</style>
