<script lang="ts">
	import { onMount } from "svelte";
	import type { TeamMemberRecord, TeamRecord } from "$lib/core";
	import { unwrap } from "$lib/utils/apiResult";
	import {
		notifyError,
		notifySuccess,
	} from "$lib/notifications/notificationEvents";
	import ConfirmModal from "$lib/components/ui/ConfirmModal.svelte";
	import Input from "$lib/components/ui/Input.svelte";
	import Select from "$lib/components/ui/Select.svelte";

	export let team: TeamRecord;
	export let mode: `rename` | `ownership`;
	export let returnFocus: HTMLButtonElement | null = null;
	export let onChanged: () => Promise<void>;
	export let onClose: () => void;

	let name = team.name;
	let members: TeamMemberRecord[] = [];
	let recipientId = ``;
	let busy = false;
	let loading = mode === `ownership`;
	let error = ``;
	let disposed = false;
	$: recipient = members.find(
		(member) => String(member.userId) === recipientId,
	);
	$: options = members.map((member) => ({
		value: String(member.userId),
		label: `${member.displayName} (@${member.username})`,
	}));
	$: valid =
		mode === `rename` ?
			Boolean(name.trim()) &&
			name.trim().length <= 100 &&
			name.trim() !== team.name
		:	Boolean(recipient);

	onMount(() => {
		if (mode === `ownership`) void loadMembers();
		return () => {
			disposed = true;
		};
	});

	async function loadMembers(): Promise<void> {
		loading = true;
		try {
			const result = await unwrap<TeamMemberRecord[]>(
				await window.chivServer.teams.members(team.id),
				`Could not load team members.`,
			);
			if (!disposed)
				members = result.filter(
					(member) => !member.isOwner && member.userId !== team.ownerUserId,
				);
		} catch (value) {
			if (!disposed)
				error =
					value instanceof Error ?
						value.message
					:	`Could not load team members.`;
		} finally {
			if (!disposed) loading = false;
		}
	}

	async function save(): Promise<void> {
		if (busy || loading || !valid) return;
		busy = true;
		error = ``;
		try {
			await unwrap(
				mode === `rename` ?
					await window.chivServer.teams.rename(team.id, name.trim())
				:	await window.chivServer.teams.transferOwnership(
						team.id,
						Number(recipientId),
					),
				`Could not update team.`,
			);
		} catch (value) {
			error = value instanceof Error ? value.message : `Could not update team.`;
			if (mode === `ownership`) {
				recipientId = ``;
				await loadMembers();
			}
			busy = false;
			return;
		}
		notifySuccess(
			mode === `rename` ? `Team renamed.` : (
				`Ownership transferred to ${recipient?.displayName}.`
			),
		);
		onClose();
		try {
			await onChanged();
		} catch (value) {
			notifyError(
				value instanceof Error ? value.message : `Team data refresh failed.`,
			);
		}
	}
</script>

<ConfirmModal
	title={mode === `rename` ? `Rename team` : `Change ownership`}
	message={mode === `rename` ?
		`Choose a new name for ${team.name}.`
	:	`The previous owner stays in the team with their assigned permissions.`}
	icon={mode === `rename` ? `fa-pen` : `fa-user-crown`}
	iconType="light"
	confirmLabel={mode === `rename` ? `Save name`
	: recipient ? `Transfer to ${recipient.displayName}`
	: `Transfer ownership`}
	confirmTone={mode === `rename` ? `primary` : `danger`}
	cancelLabel="Cancel"
	busyLabel="Saving..."
	confirmDisabled={!valid || loading}
	{busy}
	{returnFocus}
	manageOverlayState
	onConfirm={() => void save()}
	onCancel={onClose}
>
	{#if mode === `rename`}
		<Input
			label="Team name"
			value={name}
			maxlength={100}
			required
			disabled={busy}
			onChange={(value) => (name = value)}
		/>
	{:else if loading}
		<p role="status">Loading team members...</p>
	{:else if members.length}
		<Select
			label="New owner"
			value={recipientId}
			{options}
			placeholder="Choose a team member"
			disabled={busy}
			inlineMenu
			onChange={(value) => (recipientId = value)}
		/>
	{:else}
		<p>No other team members are available for ownership transfer.</p>
	{/if}
	{#if error}<p role="alert">{error}</p>{/if}
</ConfirmModal>
