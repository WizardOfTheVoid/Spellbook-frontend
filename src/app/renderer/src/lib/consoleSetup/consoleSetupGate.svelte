<script lang="ts">
	import { onMount } from "svelte";
	import ConsoleBindingSettings from "./consoleBindingSettings.svelte";
	import Button from "$lib/components/ui/Button.svelte";
	import Icon from '$lib/components/ui/Icon.svelte'
	import logoUrl from "$lib/resources/logo.svg?url";
	import { consoleSetup } from "./consoleSetupStore";
	export let onHide: () => void;
	export let onSignOut: () => void;
	export let onReturn: (() => void) | null = null;
	export let preview = false;
	const ready = consoleSetup.ready;
	let busy = false;

	onMount(() => {
		consoleSetup.setModalOpen(true);
		return () => consoleSetup.setModalOpen(false);
	});
</script>

<section
	class="console-setup-gate"
	aria-label={preview ? `Console setup preview` : `Required console setup`}
>
	<header>
		<div class="brand">
			<img src={logoUrl} alt="" /><strong>SpellBook</strong>
		</div>
		<h1>Let's set up your console key</h1>
		<p>
			SpellBook requires your Chivalry 2 in-game console key to be validated.
			Complete this step once to continue.
		</p>
	</header>
	<div class="console-setup-body">
		<ConsoleBindingSettings setup bind:busy />
		<section
			class="console-setup-continue"
			aria-labelledby="console-continue-step"
		>
			<div class="console-continue-copy">
				<h2 id="console-continue-step">Step 3: Continue</h2>
				{#if busy || !$ready}<p>Verify your keybind in step 2 first.</p>{/if}
			</div>
			<Button
				label="Continue to SpellBook"
				icon="fa-arrow-right"
				variant="primary"
				disabled={busy || !$ready}
				onClick={() => consoleSetup.continueSetup()}
			/>
		</section>
	</div>
	<footer>
		{#if onReturn}<Button
				size="sm"
				label="Back to UX & UI"
				icon="fa-arrow-left"
				onClick={onReturn}
			/>{/if}
		<Button size="sm" label="Hide SpellBook" onClick={onHide} />
		<button class="sign-out" type="button" on:click={onSignOut}>
			<Icon name="fa-right-from-bracket" size="sm" />Sign out
		</button>
	</footer>
</section>

<style lang="scss">
	.console-setup-gate {
		position: relative;
		display: grid;
		grid-template-rows: auto minmax(0, 1fr) auto;
		gap: var(--gutter-lg);
		width: min(760px, 100%);
		max-height: 100%;
		overflow: hidden;
		margin: auto;
		padding: var(--gutter-lg);
		background: var(--color-dark-primary);
		border-radius: var(--radius-xl);
	}
	header {
		display: grid;
		gap: var(--gutter-sm);
	}

	header h1 {
		margin-top: calc(var(--gutter-md) * 1);
	}

	header h1,
	header p {
		margin: 0;
	}
	.brand {
		display: flex;
		align-items: center;
		gap: var(--gutter-md);
	}
	.brand img {
		width: 40px;
		height: 40px;
		object-fit: contain;
	}
	.brand strong {
		font-size: var(--font-size-2xl);
		font-weight: var(--font-weight-bold);
	}
	.console-setup-body {
		--console-setup-columns: minmax(0, 1fr) minmax(160px, 34%);
		min-height: 0;
		overflow: auto;
	}
	.console-setup-continue {
		display: grid;
		grid-template-columns: var(--console-setup-columns);
		align-items: center;
		gap: var(--gutter-md);
		padding-top: var(--gutter-lg);
	}
	.console-setup-continue :global(.ui-button) {
		justify-self: end;
	}
	.console-continue-copy {
		display: grid;
		gap: var(--gutter-sm);
		text-align: left;
	}
	.console-setup-continue h2 {
		margin: 0;
		font-size: var(--font-size-md);
		font-weight: var(--font-weight-bold);
	}
	.console-setup-continue p {
		margin: 0;
		font-size: var(--font-size-xs);
		color: var(--color-light-tertiary);
	}
	footer {
		display: flex;
		align-items: center;
		justify-content: flex-start;
		flex-wrap: wrap;
		gap: var(--gutter-sm);
		padding-top: var(--gutter-md);
		border-top: 1px solid var(--color-dark-secondary);
	}
	.sign-out {
		display: inline-flex;
		align-items: center;
		gap: var(--gutter-sm);
		padding: var(--gutter-sm);
		border: 0;
		background: transparent;
		color: var(--color-light-tertiary);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight);
	}
	.sign-out:hover {
		color: var(--color-light-primary);
		text-decoration: underline;
	}
	.sign-out:focus-visible {
		outline: 2px solid var(--color-accent-primary);
		outline-offset: 2px;
	}
	@media (max-width: 600px), (max-height: 760px) {
		.console-setup-gate {
			padding: var(--gutter-md);
			gap: var(--gutter-md);
		}
	}
</style>
