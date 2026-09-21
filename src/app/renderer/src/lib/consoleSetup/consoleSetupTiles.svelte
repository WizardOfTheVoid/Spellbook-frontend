<script lang="ts">
	import { onMount } from "svelte";
	import Tile from "$lib/components/ui/Tile.svelte";
	import TileGrid from "$lib/components/ui/TileGrid.svelte";
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

<TileGrid columns={1}>
	<Tile
		title="Check in-game console"
		icon="fa-terminal"
		subtitle={$consoleSetup.enabled.status === `passed` ? `In-game console is enabled.` : $consoleSetup.enabled.status === `failed` ? `In-game console is disabled.` : $consoleSetup.enabled.message}
		tooltip="Click to check if the in-game console is enabled."
		tone={tone($consoleSetup.enabled)}
		value={$consoleSetup.enabled.status === `passed` ? `Enabled` : $consoleSetup.enabled.status === `failed` ? `Disabled` : null}
		disabled={disabled || configBusy}
		onClick={() => void consoleSetup.run(`checkConsoleEnabled`)}
	/>
	<Tile
		title="Check console keybind"
		icon="fa-keyboard"
		tone={tone($consoleSetup.binding)}
		tooltip={$consoleSetup.binding.message}
		subtitle={$gameProcessAvailable ?
			$consoleSetup.binding.message
		:	`Start Chivalry 2 to check the console key.`}
		disabled={disabled || bindBusy || !$gameProcessAvailable}
		onClick={() => void consoleSetup.run(`checkConsoleBind`, true)}
	/>
</TileGrid>
