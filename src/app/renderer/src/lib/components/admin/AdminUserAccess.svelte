<script lang="ts">
	import type { AdminUserRecord } from "$lib/core"
	import Button from "$lib/components/ui/Button.svelte"
	import Icon from "$lib/components/ui/Icon.svelte"

	export let user: AdminUserRecord
	export let disabled = false
	export let saving = false
	export let onBan: () => void
	export let onEnable: () => void

	$: banned = Boolean(user.bannedAt)
	$: pending = !banned && !user.isActive
</script>

<section class="account-access" class:account-access--banned={banned} class:account-access--pending={pending} aria-label="Account access">
	<div class="account-access__heading">
		<Icon name={banned ? "fa-ban" : pending ? "fa-hourglass-half" : "fa-circle-check"} size="lg" />
		<div>
			<h2>{banned ? "This user is banned" : pending ? "Awaiting approval" : "Account enabled"}</h2>
			<p>{banned ? "Access to SpellBook is suspended." : pending ? "This user is signed in and waiting for approval." : "This user can access SpellBook."}</p>
		</div>
		<div class="account-access__actions">
			{#if banned}
				<Button label={saving ? `Unbanning...` : `Unban user`} icon="fa-unlock" disabled={disabled || saving} onClick={onEnable} />
			{:else}
				{#if pending}<Button label={saving ? `Approving...` : `Approve user`} icon="fa-check" disabled={disabled || saving} onClick={onEnable} />{/if}
				<Button label="Ban user" icon="fa-ban" variant="danger" disabled={disabled || saving} onClick={onBan} />
			{/if}
		</div>
	</div>
	{#if banned}
		<div class="account-access__reason">
			<div><strong>Ban reason</strong><time datetime={user.bannedAt ?? undefined}>{user.bannedAt ? new Date(user.bannedAt).toLocaleString() : ""}</time></div>
			<p>{user.banReason?.trim() ? user.banReason : "No reason was recorded."}</p>
		</div>
	{/if}
</section>

<style lang="scss">
	.account-access { display: grid; gap: var(--gutter-md); border: 1px solid var(--color-dark-secondary); border-radius: var(--radius); padding: var(--gutter-md); }
	.account-access__heading { display: flex; align-items: center; gap: var(--gutter-md); }
	.account-access__heading > div:first-of-type { flex: 1; min-width: 0; }
	h2, p { margin: 0; }
	h2 { font-size: var(--font-size-md); font-weight: var(--font-weight-medium); }
	.account-access__heading p { margin-top: 5px; color: var(--color-light-secondary); font-size: var(--font-size-sm); line-height: 1.5; }
	.account-access__actions { display: flex; flex-wrap: wrap; gap: var(--gutter-sm); }
	.account-access--banned { border-color: rgbaa(var(--color-accent-quaternary), 0.5); background: rgbaa(var(--color-accent-quaternary), 0.055); }
	.account-access--banned h2, .account-access--banned :global(.icon) { color: var(--color-accent-quaternary); }
	.account-access--pending { border-color: rgbaa(var(--color-accent-primary), 0.4); }
	.account-access__reason { padding-top: var(--gutter-md); border-top: 1px solid rgbaa(var(--color-accent-quaternary), 0.2); }
	.account-access__reason > div { display: flex; flex-wrap: wrap; justify-content: space-between; gap: var(--gutter-sm); font-size: var(--font-size-xs); }
	.account-access__reason time { color: var(--color-light-tertiary); }
	.account-access__reason p { margin-top: var(--gutter-sm); white-space: pre-wrap; overflow-wrap: anywhere; color: var(--color-light-primary); line-height: 1.6; }
	@media (max-width: 640px) { .account-access__heading { flex-wrap: wrap; } .account-access__actions { width: 100%; } }
</style>
