<script lang="ts">
	import type { TeamInvitationDecision, TeamInvitationView } from '@spellbook/shared/notifications'
	import Button from '$lib/components/ui/Button.svelte'

	export let invitation: TeamInvitationView
	export let onDecide: (decision: TeamInvitationDecision) => Promise<void>
	let busy = false
	let error: string | null = null

	async function decide(decision: TeamInvitationDecision): Promise<void> {
		if (busy || invitation.status !== `pending`) return
		busy = true
		error = null
		try {
			await onDecide(decision)
		} catch (value) {
			error = value instanceof Error ? value.message : `Could not respond to this invitation.`
		} finally {
			busy = false
		}
	}
</script>

<div class="invitation-actions">
	{#if invitation.status === `pending`}
		<Button label="Yes" size="sm" variant="primary" disabled={busy} onClick={() => void decide(`accept`)} />
		<Button label="No" size="sm" disabled={busy} onClick={() => void decide(`decline`)} />
	{:else}
		<small role="status">{invitation.status === `accepted` ? `Joined` : invitation.status === `declined` ? `Declined` : `Invitation unavailable`}</small>
	{/if}
</div>
{#if error}<p class="invitation-error" role="alert">{error}</p>{/if}

<style lang="scss">
	.invitation-actions {
		display: flex;
		align-items: center;
		gap: var(--gutter-sm);
	}
	.invitation-error {
		color: var(--color-accent-quaternary);
	}
</style>
