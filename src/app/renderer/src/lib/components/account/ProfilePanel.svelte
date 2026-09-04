<script lang="ts">
	import { authState, completeOnboarding } from "$lib/auth/user";
	import {
		notifyError,
		notifySuccess,
	} from "$lib/notifications/notificationEvents";
	import Button from "$lib/components/ui/Button.svelte";
	import Icon from "$lib/components/ui/Icon.svelte";
	import Input from "$lib/components/ui/Input.svelte";
	import PanelHeader from "$lib/components/ui/PanelHeader.svelte";

	export let hidden = false;

	let displayName = "";
	let playfabId = "";
	let loadedUserId: number | null = null;
	let saving = false;

	$: if ($authState.user && $authState.user.id !== loadedUserId) {
		loadedUserId = $authState.user.id;
		displayName = $authState.user.displayName;
		playfabId = $authState.user.playfabId ?? "";
	}

	async function save(): Promise<void> {
		if (!displayName.trim() || !playfabId.trim()) return;
		saving = true;
		try {
			await completeOnboarding(displayName, playfabId);
			notifySuccess("Profile saved.");
		} catch (error) {
			notifyError(
				error instanceof Error ? error.message : "Profile save failed.",
			);
		} finally {
			saving = false;
		}
	}
</script>

<section {hidden} class="panel-view account-panel" aria-label="Profile">
	<PanelHeader title="Profile" eyebrow="Account" />
	<div class="profile-content panel-subview grid-stack gap-125">
		<div class="profile-identity">
			<span class="profile-avatar">
				{#if $authState.user?.avatarUrl}
					<img src={$authState.user.avatarUrl} alt="" />
				{:else}
					<Icon name="fa-user" size="xlg" tone="muted" />
				{/if}
			</span>
			<span class="profile-identity__copy">
				<strong>{$authState.user?.displayName ?? "User"}</strong>
				<small>@{$authState.user?.username ?? "discord"}</small>
			</span>
		</div>

		<form class="profile-form" on:submit|preventDefault={() => void save()}>
			<Input
				id="profile-display-name"
				label="Display name"
				value={displayName}
				maxlength={255}
				required
				disabled={saving}
				onChange={(value) => (displayName = value)}
			/>
			<Input
				id="profile-playfab-id"
				label="PlayFab ID"
				value={playfabId}
				maxlength={255}
				required
				disabled={saving}
				onChange={(value) => (playfabId = value)}
			/>
			<Input
				id="profile-discord-name"
				label="Discord"
				value={$authState.user?.username ?? ""}
				icon="fa-at"
				disabled
			/>
			<div class="profile-form__actions">
				<Button
					label="Save profile"
					icon="fa-floppy-disk"
					variant="primary"
					disabled={saving || !displayName.trim() || !playfabId.trim()}
					onClick={() => void save()}
				/>
			</div>
		</form>
	</div>
</section>

<style lang="scss">
	.account-panel {
		height: 100%;
		padding: var(--panel-padding);
		display: grid;
		grid-template-rows: auto 1fr;
		gap: var(--gutter-lg);
	}
	.profile-content {
		min-height: 0;
		overflow: auto;
	}
	.profile-identity {
		display: flex;
		align-items: center;
		gap: var(--gutter-lg);
		padding-bottom: var(--gutter-md);
		border-bottom: 1px solid var(--color-dark-secondary);
	}
	.profile-avatar {
		width: 88px;
		height: 88px;
		display: grid;
		place-items: center;
		flex: 0 0 auto;
		overflow: hidden;
		border: 1px solid var(--color-dark-tertiary);
		border-radius: 999px;
	}
	.profile-avatar img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.profile-identity__copy {
		min-width: 0;
		display: grid;
		gap: var(--gutter-sm);
	}
	.profile-identity__copy strong {
		overflow: hidden;
		font-size: var(--font-size-2xl);
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.profile-identity__copy small {
		color: var(--color-light-tertiary);
	}
	.profile-form {
		max-width: 520px;
		display: grid;
		align-content: start;
		gap: var(--gutter-md);
	}
	.profile-form__actions {
		display: flex;
		justify-content: flex-end;
	}
</style>
