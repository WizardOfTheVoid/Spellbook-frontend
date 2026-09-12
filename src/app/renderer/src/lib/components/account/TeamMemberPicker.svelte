<script lang="ts">
	import type { TeamMemberRecord } from "$lib/core";
	import Icon from "$lib/components/ui/Icon.svelte";
	import IconButton from "$lib/components/ui/IconButton.svelte";

	export let users: TeamMemberRecord[] = [];
	export let disabled = false;
	export let loading = false;
	export let onOpen: () => Promise<void>;
	export let onAdd: (user: TeamMemberRecord) => Promise<void>;

	let open = false;
	let addingUserId: number | null = null;

	async function toggle(): Promise<void> {
		open = !open;
		if (open) await onOpen();
	}

	async function add(user: TeamMemberRecord): Promise<void> {
		addingUserId = user.userId;
		try {
			await onAdd(user);
			open = false;
		} finally {
			addingUserId = null;
		}
	}

	function dismiss(event: MouseEvent): void {
		event.preventDefault();
		event.stopPropagation();
		open = false;
	}
</script>

<svelte:window
	on:keydown={(event) => {
		if (event.key === "Escape") open = false;
	}}
/>

<div class="member-picker">
	<IconButton
		icon="fa-plus"
		ariaLabel="Add team member"
		expanded={open}
		controls="team-member-options"
		hasPopup="listbox"
		{disabled}
		onClick={() => void toggle()}
	/>

	{#if open}
		<button
			class="member-picker__scrim"
			type="button"
			tabindex="-1"
			aria-hidden="true"
			on:click={dismiss}
		></button>
		<div
			id="team-member-options"
			class="member-picker__popover"
			role="listbox"
			aria-label="Available users"
		>
			<p class="member-picker__title">Add member</p>
			{#if loading}
				<p class="member-picker__empty">Loading users...</p>
			{:else if users.length === 0}
				<p class="member-picker__empty">No users available.</p>
			{:else}
				{#each users as user (user.userId)}
					<button
						class="member-picker__option"
						type="button"
						role="option"
						aria-selected="false"
						disabled={addingUserId !== null}
						on:click={() => void add(user)}
					>
						<span class="member-avatar">
							{#if user.avatarUrl}<img
									src={user.avatarUrl}
									alt=""
								/>{:else}<Icon name="fa-user" size="md" tone="muted" />{/if}
						</span>
						<span class="member-picker__copy">
							<strong>{user.displayName}</strong>
							<small>{user.playfabId ?? "No PlayFab ID"}</small>
						</span>
					</button>
				{/each}
			{/if}
		</div>
	{/if}
</div>

<style lang="scss">
	.member-picker {
		position: relative;
		display: inline-flex;
	}
	.member-picker__scrim {
		position: fixed;
		inset: 0;
		z-index: var(--z-popover);
		border: 0;
		border-radius: 0;
		background: transparent;
	}
	.member-picker__popover {
		position: absolute;
		top: calc(100% + var(--gutter-sm));
		right: 0;
		z-index: calc(var(--z-popover) + 1);
		width: min(340px, 70vw);
		max-height: 360px;
		display: grid;
		gap: var(--gutter-sm);
		overflow: auto;
		border: 1px solid var(--color-dark-secondary);
		border-radius: var(--radius);
		padding: var(--gutter-sm);
		background: var(--color-dark-primary);
		box-shadow: var(--shadow);
	}
	.member-picker__title,
	.member-picker__empty {
		margin: 0;
		padding: var(--gutter-sm);
	}
	.member-picker__title {
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
	}
	.member-picker__empty {
		color: var(--color-light-tertiary);
		font-size: var(--font-size-xs);
	}
	.member-picker__option {
		min-width: 0;
		min-height: 58px;
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		align-items: center;
		gap: var(--gutter-md);
		border: 0;
		border-radius: var(--radius);
		padding: var(--gutter-sm);
		background: transparent;
		text-align: left;
	}
	.member-picker__option:hover:not(:disabled) {
		background: rgbaa(var(--color-dark-secondary), 0.12);
	}
	.member-picker__copy {
		min-width: 0;
		display: grid;
		gap: 3px;
	}
	.member-picker__copy strong,
	.member-picker__copy small {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.member-picker__copy small {
		color: var(--color-light-tertiary);
	}
	.member-avatar {
		width: 38px;
		height: 38px;
		display: grid;
		place-items: center;
		overflow: hidden;
		border: 1px solid var(--color-dark-tertiary);
		border-radius: 999px;
	}
	.member-avatar img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
</style>
