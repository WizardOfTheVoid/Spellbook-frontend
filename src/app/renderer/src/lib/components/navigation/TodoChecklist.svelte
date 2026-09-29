<script lang="ts">
	import { onMount } from "svelte";
	import type { ActivePage } from "$lib/types/ui";
	import { unwrap } from "$lib/utils/apiResult";
	import { notifyError } from "$lib/notifications/notificationEvents";
	import Tile from "$lib/components/ui/Tile.svelte";
	import Button from "$lib/components/ui/Button.svelte";
	import { consoleSetup } from "$lib/consoleSetup/consoleSetupStore";
	import type { ConsoleCheck } from "../../../../../shared/consoleSetup";
	import { gameProcessAvailable } from '$lib/stores/gameProcessAvailabilityStore'
	import { startOnboardingChecks } from './onboardingChecks'

	export let onNavigate: (page: ActivePage) => void;
	let status: {
		hasPlayfabId: boolean;
		hasTeam: boolean;
		hasProfile: boolean;
		joinedDiscord: boolean | null;
	} | null = null;
	let loading = true;
	let error = ``;
	let checks: ReturnType<typeof startOnboardingChecks> | undefined
	$: items = [
		{
			label: `Ensure you have a PlayFab ID in your profile`,
			tooltip: `Click to add your PlayFab ID.`,
			done: status?.hasPlayfabId,
			open: () => onNavigate(`account`),
		},
		{
			label: `Ensure in-game console is enabled`,
			tooltip: `Open Settings and click Check in-game console.`,
			done: completion($consoleSetup.enabled),
			local: true,
			open: () => onNavigate(`settings`),
		},
		{
			label: `Ensure in-game console key is set properly`,
			tooltip: `Choose the same console key in SpellBook and the game.`,
			done: completion($consoleSetup.binding),
			requiresGame: true,
			local: true,
			open: () => onNavigate(`settings`),
		},
		{
			label: `Ensure game is in windowed mode`,
			tooltip: `Change it in-game: Settings -> Options -> Video -> Window Mode: Windowed Fullscreen.`,
			done: completion($consoleSetup.windowMode),
			local: true,
			open: () => void consoleSetup.run(`checkConsoleEnabled`),
		},
		{
			label: `Create a team or join an existing team`,
			tooltip: `Click to create or join a team.`,
			done: status?.hasTeam,
			open: () => onNavigate(`teams`),
		},
		{
			label: `Create a personal or team profile`,
			tooltip: `Click to create a profile.`,
			done: status?.hasProfile,
			open: () => onNavigate(`profiles`),
		},
		{
			label: `Join TWA Discord`,
			tooltip: `Click to join our Discord.`,
			done: status?.joinedDiscord,
			open: () => void openDiscord(),
		},
	];

	onMount(() => {
		checks = startOnboardingChecks({
			account: refresh,
			settings: () => consoleSetup.run(`checkConsoleEnabled`),
			game: async () => {
				await gameProcessAvailable.refresh()
				return $gameProcessAvailable
			},
			binding: () => consoleSetup.run(`checkConsoleBind`, true)
		})
		return () => checks?.stop()
	});

	function completion(check: ConsoleCheck | undefined): boolean | null {
		return (
			check?.status === `passed` ? true
			: check?.status === `failed` ? false
			: null
		);
	}

	async function refresh(): Promise<void> {
		loading = status === null
		error = ``;
		try {
			status = await unwrap(
				await window.chivServer.todo(),
				`Could not check your progress.`,
			);
		} catch (value) {
			status = null
			error =
				value instanceof Error ?
					value.message
				:	`Could not check your progress.`;
		} finally {
			loading = false;
		}
	}

	async function openDiscord(): Promise<void> {
		try {
			await window.chivAuth.openHelp();
		} catch {
			notifyError(`Discord could not be opened.`);
		}
	}
</script>

<div class="todo-list">
	{#if loading}<p role="status">Checking your progress...</p>{/if}
	{#if error}<p role="alert">{error}</p>
		<Button label="Retry" onClick={() => void checks?.refresh()} />{/if}
	{#each items as item}
		{@const needsGame = item.requiresGame && !$gameProcessAvailable && item.done !== true}
		{@const unknown =
			needsGame || (loading && !item.local) || item.done === null || item.done === undefined}
		<Tile
			title={item.label}
			tooltip={needsGame ? `Go in-game to check this.` : item.tooltip}
			icon={needsGame ? `fa-question` : unknown ? `fa-minus`
			: item.done ? `fa-check`
			: `fa-xmark`}
			iconTone={needsGame ? `warning` : !unknown && item.done ? `success` : `default`}
			ariaLabel={`${item.label}: ${
				needsGame ? `Go in-game` : unknown ? `Not checked`
				: item.done ? `Complete`
				: `Incomplete`
			}`}
			onClick={item.open}
		/>
	{/each}
	{#if !loading && status?.joinedDiscord === null}
		<small>Bot ain't bottin' - try again when the bot is available.</small>
		<Button label="Check again" onClick={() => void checks?.refresh()} />
	{/if}
</div>

<style lang="scss">
	.todo-list {
		display: grid;
		gap: var(--gutter-md);
	}
	small {
		color: var(--color-light-secondary);
	}
</style>
