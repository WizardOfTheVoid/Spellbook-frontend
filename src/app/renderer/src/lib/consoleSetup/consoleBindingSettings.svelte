<script lang="ts">
	import KeybindSetting from "$lib/components/settings/KeybindSetting.svelte";
	import Select from "$lib/components/ui/Select.svelte";
	import Button from "$lib/components/ui/Button.svelte";
	import ConsoleSetupTiles from "./consoleSetupTiles.svelte";
	import { consoleSetup } from "./consoleSetupStore";
	import { gameProcessAvailable } from "$lib/stores/gameProcessAvailabilityStore";
	import { settingsSnapshot } from "$lib/settings/settings-store";
	import { celebrateElement } from '$lib/utils/celebrate'

	export let hidden = false;
	export let disabled = false;
	export let setup = false;
	export let busy = false;
	const ready = consoleSetup.ready;
	let keyBusy = false;
	let keyHint = ``;
	let savingLayout = false;
	let saveError = ``;
	let verificationElement: HTMLDivElement | null = null
	$: checking = $consoleSetup.binding.status === `checking`;
	$: locked = disabled || checking || savingLayout || $consoleSetup.writing;
	$: busy = locked || keyBusy;
	$: options = $consoleSetup.layouts.map((layout) => ({
		value: layout.id,
		label: layout.displayName,
	}));
	$: verified = $ready && !keyBusy;
	$: verificationFailed = [`failed`, `unavailable`].includes($consoleSetup.binding.status)
	$: savedLayout = $consoleSetup.selectedLayout?.source === `detected`
		? $consoleSetup.layouts.find(layout => layout.id === $consoleSetup.selectedLayout?.layoutId)
		: null
	$: verificationHint =
		verified ? ``
		: !$gameProcessAvailable ? `Start Chivalry 2, then select Verify.`
		: $consoleSetup.recordRequired ? `Set your console key in step 1 first.`
		: verificationFailed ?
			$consoleSetup.binding.message
		:	``;

	async function verify() {
		if (!$gameProcessAvailable) return
		await consoleSetup.run(`checkConsoleBind`, true)
		if (setup && $ready && verificationElement?.isConnected) celebrateElement(verificationElement)
	}

	async function selectLayout(layoutId: string) {
		savingLayout = true;
		saveError =
			(await consoleSetup.setLayout(layoutId)) ?
				``
			:	`Could not save the keyboard layout. Try again.`;
		savingLayout = false;
	}
</script>

<div
	class="console-binding-group"
	class:console-binding-group--setup={setup}
	{hidden}
>
	<div class:console-setup-step={setup}>
		{#if setup}
			<div class="console-step-copy">
				<h2>Step 1: Set your console key</h2>
				<p>Click on the input & set your Chivalry 2 in-game console key.</p>
				{#if keyHint}<small aria-live="polite">{keyHint}</small>{/if}
			</div>
		{/if}
		<KeybindSetting
			compact
			field={setup}
			name="consoleKey"
			{hidden}
			disabled={locked}
			bind:busy={keyBusy}
			bind:hint={keyHint}
			savedContext={savedLayout ? `on keyboard overlay for ${savedLayout.displayName}` : ``}
			onSaved={setup ? verify : null}
		/>
	</div>
	{#if !setup}
		<div class="console-binding-layout">
			<div class="console-binding-copy">
				<strong>Layout SpellBook uses</strong>
				{#if $consoleSetup.selectedLayout}<small aria-live="polite"
						>{$consoleSetup.selectedLayout.source === `manual` ?
							`Manual selection`
						:	`Detected by keybind check`}</small
					>{/if}
			</div>
			<Select
				label="Layout SpellBook uses"
				showLabel={false}
				value={$consoleSetup.selectedLayout?.layoutId ?? ``}
				{options}
				placeholder="Check keybind to detect"
				disabled={busy ||
					$consoleSetup.setupRequired ||
					$consoleSetup.layoutCatalogStatus !== `ready`}
				error={saveError || null}
				onChange={(value) => void selectLayout(value)}
			/>
		</div>
	{/if}
	<div class="console-binding-checks" class:console-setup-step={setup}>
		<div class="console-step-copy">
			{#if setup}
				<h2>Step 2: Verify your keybind</h2>
				{#if verificationHint}<p class:console-binding-error={verificationFailed} aria-live="polite">{verificationHint}</p>{/if}
			{/if}
			{#if $consoleSetup.setupReason === `layoutUnavailable`}<p role="alert">
					Keyboard layout unavailable. Record and check your console key using a
					layout configured in Windows.
				</p>{/if}
			{#if $consoleSetup.setupReason === `coreUpgradeRequired`}<p role="alert">
					Update SpellBook Core to configure keyboard layouts.
				</p>{/if}
			{#if $consoleSetup.layoutCatalogStatus !== `ready` || $consoleSetup.setupReason === `storageUnavailable`}
				<p role="alert">
					{$consoleSetup.binding.status === `unavailable` ?
						$consoleSetup.binding.message
					:	`Keyboard layouts are unavailable. Check Core and retry.`}
				</p>
			{/if}
			{#if $consoleSetup.restorationFault}<p role="alert">
					{$consoleSetup.restorationFault}
				</p>{/if}
			{#if !setup && $consoleSetup.recordRequired}<p>
					{$settingsSnapshot?.settings.consoleKey ?
						`Rebind your in-game console key above. You can reuse your existing key.`
					:	`Bind your in-game console key above.`}
				</p>{/if}
			{#if !setup && !$gameProcessAvailable}<p>
					Start Chivalry 2 to finish setup.
				</p>{/if}
		</div>
		<div
			class="console-binding-actions"
			class:console-binding-actions--setup={setup}
		>
			{#if setup}<div aria-live="polite" bind:this={verificationElement} class:console-verified={verified}>
					<Button
						label={checking ? `Verifying…` : verified ? `Verified` : `Verify`}
						icon={verified ? `fa-circle-check` : `fa-check`}
						disabled={busy ||
							$consoleSetup.recordRequired ||
							!$gameProcessAvailable}
						onClick={verify}
					/>
				</div>{/if}
			{#if $consoleSetup.layoutCatalogStatus !== `ready` || $consoleSetup.setupReason === `storageUnavailable`}
				<Button
					size="sm"
					label="Retry keyboard layouts"
					icon="fa-rotate"
					disabled={busy}
					onClick={() => void consoleSetup.run(`refreshKeyboardLayouts`)}
				/>
			{/if}
			{#if $consoleSetup.restorationFault}
				<Button
					size="sm"
					label="Retry layout restoration"
					icon="fa-rotate"
					disabled={busy}
					onClick={() => void consoleSetup.run(`retryKeyboardLayoutRestore`)}
				/>
			{/if}
			{#if $consoleSetup.enabled.status === `failed`}<Button
					size="sm"
					label="Enable in-game console"
					icon="fa-terminal"
					disabled={busy}
					onClick={() => void consoleSetup.run(`enableConsole`)}
				/>{/if}
			{#if !setup}<ConsoleSetupTiles {hidden} disabled={busy} />{/if}
		</div>
	</div>
</div>

<style lang="scss">
	.console-binding-group {
		display: grid;
		gap: var(--gutter-md);
		min-width: 0;
		border: 1px solid var(--color-dark-secondary);
		border-radius: var(--radius-xl);
		padding: var(--gutter-md);
		background: var(--color-dark-primary);
		container-type: inline-size;
	}
	.console-binding-group[hidden] {
		display: none;
	}
	.console-binding-layout {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(160px, 240px);
		align-items: center;
		gap: var(--gutter-md);
	}
	.console-binding-copy {
		display: grid;
		gap: 4px;
	}
	strong {
		font-size: var(--font-size-md);
		font-weight: var(--font-weight-medium);
	}
	small {
		font-size: var(--font-size-xs);
		color: var(--color-light-tertiary);
	}
	.console-binding-hint {
		font-weight: var(--font-weight);
	}
	p {
		margin: 0;
		font-size: var(--font-size-xs);
	}
	.console-binding-checks {
		display: grid;
		gap: var(--gutter-md);
	}
	.console-step-copy,
	.console-binding-actions {
		display: grid;
		gap: var(--gutter-sm);
		text-align: left;
	}
	.console-step-copy:empty {
		display: none;
	}
	.console-binding-actions--setup {
		justify-items: end;
		justify-self: end;
	}
	.console-binding-group--setup {
		border: 0;
		border-radius: 0;
		padding: 0;
		gap: var(--gutter-lg);
	}
	.console-setup-step {
		display: grid;
		grid-template-columns: var(--console-setup-columns);
		align-items: center;
		gap: var(--gutter-md);
		padding-bottom: var(--gutter-lg);
		border-bottom: 1px solid var(--color-dark-secondary);
	}
	h2 {
		margin: 0;
		font-size: var(--font-size-md);
		font-weight: var(--font-weight-bold);
	}
	.console-verified :global(.icon) {
		color: var(--color-accent-secondary);
	}
	.console-binding-error {
		color: var(--color-danger);
	}
	@container (max-width: 380px) {
		.console-binding-layout {
			grid-template-columns: minmax(0, 1fr);
			gap: var(--gutter-sm);
		}
	}
</style>
