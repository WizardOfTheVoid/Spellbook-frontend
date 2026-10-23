<script lang="ts">
	import { onMount } from "svelte";
	import Icon from "$lib/components/ui/Icon.svelte"
	import { gameProcessAvailable } from "$lib/stores/gameProcessAvailabilityStore";
	import type { ConsoleCheck } from "../../../../shared/consoleSetup";
	import { consoleSetup } from "./consoleSetupStore";

	export let hidden = false;
	export let disabled = false;
	let mounted = false;
	let opened = false;

	onMount(() => {
		mounted = true;
	});
	$: show(mounted && !hidden);
	$: configBusy = $consoleSetup.enabled.status === `checking`;
	$: bindBusy = $consoleSetup.binding.status === `checking`;
	$: bindingMessage = $consoleSetup.binding.message === `No valid clipboard output arrived after the Command was submitted.`
		? `SpellBook & Chivalry 2 doesn't have the same console key set`
		: $consoleSetup.binding.message

	function show(visible: boolean) {
		if (opened === visible) return;
		opened = visible;
		if (visible) void consoleSetup.run(`checkConsoleEnabled`);
	}

	function tone(check: ConsoleCheck) {
		return (
			check.status === `passed` ? `success`
			: check.status === `failed` ? `danger`
			: check.status === `unavailable` ? `warning`
			: `default`
		);
	}
</script>

<div class="console-checks">
  <button type="button" aria-label="Check in-game console" disabled={disabled || configBusy} on:click={() => void consoleSetup.run(`checkConsoleEnabled`)}>
    <Icon name="fa-terminal" size="sm" tone={tone($consoleSetup.enabled)} />
    <span class="console-check-copy"><strong>In-game console</strong><small>{$consoleSetup.enabled.status === `passed` ? `Enabled` : $consoleSetup.enabled.message}</small></span>
    <span class="console-check-action">{configBusy ? `Checking…` : `Check`}</span>
  </button>
  <button type="button" aria-label="Check console keybind" disabled={disabled || bindBusy || $consoleSetup.recordRequired || !$gameProcessAvailable} on:click={() => void consoleSetup.run(`checkConsoleBind`, true)}>
    <Icon name="fa-keyboard" size="sm" tone={tone($consoleSetup.binding)} />
    <span class="console-check-copy"><strong>Console keybind</strong><small>{$gameProcessAvailable ? $consoleSetup.binding.status === `passed` ? `Verified` : bindingMessage : `Start Chivalry 2 to check the key.`}</small></span>
    <span class="console-check-action">{bindBusy ? `Checking…` : `Check`}</span>
  </button>
</div>

<style lang="scss">
  .console-checks { display: grid; border-top: 1px solid var(--color-dark-secondary); }
  button { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: var(--gutter-md); width: 100%; padding: var(--gutter-sm) 0; border: 0; border-radius: 0; text-align: left; }
  button + button { border-top: 1px solid var(--color-dark-secondary); }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
  .console-check-copy { display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px var(--gutter-sm); }
  strong { font-size: var(--font-size-xs); font-weight: var(--font-weight-medium); }
  small { font-size: var(--font-size-xs); color: var(--color-light-tertiary); }
  .console-check-action { display: inline-flex; align-items: center; justify-content: center; min-width: 72px; min-height: var(--control-height-sm); padding: 0 var(--gutter-md); border: 1px solid var(--color-dark-secondary); border-radius: var(--radius); font-size: var(--font-size-xs); font-weight: var(--font-weight-medium); color: var(--color-light-secondary); }
</style>
