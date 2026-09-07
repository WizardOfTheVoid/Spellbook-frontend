<script lang="ts">
	import { onMount } from "svelte";
	import { authState } from "$lib/auth/user"
	import type { ActivePage } from "$lib/types/ui";
	import { unwrap } from "$lib/utils/apiResult";
	import { notifyError } from "$lib/notifications/notificationEvents";
	import Tile from "$lib/components/ui/Tile.svelte";
	import Button from "$lib/components/ui/Button.svelte";

	export let onNavigate: (page: ActivePage) => void;
	let status: {
		hasPlayfabId: boolean;
		hasTeam: boolean;
		hasProfile: boolean;
		joinedDiscord: boolean | null;
	} | null = null;
	let loading = true;
	let error = ``;
	let consoleKeyChecked = false
	$: consoleKeyProgressKey = `spellbook:onboarding:console-key:${$authState.user?.id}`
	$: items = [
		{
			label: `Ensure you have a PlayFab ID in your profile`,
			done: status?.hasPlayfabId,
			open: () => onNavigate(`account`),
		},
		{
			label: `Ensure in-game console key is set prorperly`,
			done: consoleKeyChecked,
			local: true,
			open: openConsoleSettings,
		},
		{
			label: `Create a team or join an existing team`,
			done: status?.hasTeam,
			open: () => onNavigate(`teams`),
		},
		{
			label: `Create a personal or team profile`,
			done: status?.hasProfile,
			open: () => onNavigate(`profiles`),
		},
		{
			label: `Join TWA Discord`,
			done: status?.joinedDiscord,
			open: () => void openDiscord(),
		},
	];

	onMount(() => {
		try {
			consoleKeyChecked = localStorage.getItem(consoleKeyProgressKey) === `true`
		} catch {
			consoleKeyChecked = false
		}
		void refresh();
	});

	function openConsoleSettings(): void {
		consoleKeyChecked = true
		try {
			localStorage.setItem(consoleKeyProgressKey, `true`)
		} catch {
			notifyError(`Could not save your console-key onboarding progress.`)
		}
		onNavigate(`settings`)
	}

	async function refresh(): Promise<void> {
		loading = true;
		error = ``;
		try {
			status = await unwrap(
				await window.chivServer.todo(),
				`Could not check your progress.`,
			);
		} catch (value) {
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
		<Button label="Retry" onClick={() => void refresh()} />{/if}
	{#each items as item}
		{@const unknown = (loading && !item.local) || item.done === null || item.done === undefined}
		<Tile
			title={item.label}
			icon={unknown ? `fa-minus`
			: item.done ? `fa-check`
			: `fa-xmark`}
			iconTone={!unknown && item.done ? `success` : `default`}
			ariaLabel={`${item.label}: ${
				unknown ? `Not checked`
				: item.done ? `Complete`
				: `Incomplete`
			}`}
			onClick={item.open}
		/>
	{/each}
	{#if !loading && status?.joinedDiscord === null}
		<small>Bot ain't bottin' - try again when the bot is available.</small>
		<Button label="Check again" onClick={() => void refresh()} />
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
