<script lang="ts">
	import type { PlayerState } from "$lib/types/playerState";
	import type {
		PlayerArchiveResult,
		PlayerArchiveSession,
	} from "$lib/utils/playerArchive";
	import { authState } from "$lib/auth/user";
	import { formatTime } from "$lib/utils/playerUtils";
	import IconButton from "$lib/components/ui/IconButton.svelte";
	import PanelHeader from "$lib/components/ui/PanelHeader.svelte";
	import { createWantedPlayer } from "$lib/utils/wantedActionsApi";
	import {
		notifyError,
		notifySuccess,
	} from "$lib/notifications/notificationEvents";
	import PlayerArchive from "./PlayerArchive.svelte";
	import WantedAddModal from "./WantedAddModal.svelte";
	import { addWantedPlayers } from "./wantedBulkAdd";
	import WantedAmbient from "./WantedAmbient.svelte";
	import Tabs from "$lib/components/ui/tabs.svelte";
	import InfoNotice from "$lib/components/ui/infoNotice.svelte";
	import Wip from "$lib/components/ui/wip.svelte";
	import { navigation, rememberNavigation } from "$lib/navigation/navigation";

	export let isActive = false;
	export let onSelectPlayer: (player: PlayerState) => void;
	export let onOpenPlayerProfile: (player: PlayerState) => void;
	export let session: PlayerArchiveSession | null = null;

	const tabs = [
		{ value: `players`, label: `Wanted players` },
		{ value: `history`, label: `History` },
	];
	let tab = `players`;
	rememberNavigation(
		`wantedTab`,
		() => tab,
		(value) => {
			tab = value;
		},
	);

	let refreshRevision = 0;
	let loading = false;
	let isSearch = false;
	let currentPage = 1;
	let totalPages = 0;
	let lastRefresh = "--:--:--";
	let adding = false;
	let addBusy = false;
	let addError: string | null = null;

	function handleResult(result: PlayerArchiveResult): void {
		loading = result.state === "loading";
		isSearch = result.isSearch ?? false;
		currentPage = result.meta.currentPage;
		totalPages = result.meta.totalPages;
		if (result.refreshedAt)
			lastRefresh = formatTime(new Date(result.refreshedAt));
	}

	async function add(playfabIds: string, mock: boolean): Promise<string[]> {
		if (addBusy) return [];
		addBusy = true;
		addError = null;
		try {
			const { added, failed } = await addWantedPlayers(playfabIds, mock, createWantedPlayer);
			if (added) refreshRevision += 1;
			if (failed.length) {
				addError = `${added} added, ${failed.length} failed. ${failed[0].error}`;
				notifyError(addError);
				return failed.map(({ playfabId }) => playfabId);
			}
			if (!added) {
				addError = `Enter at least one PlayFab ID.`;
				return [];
			}
			adding = false;
			notifySuccess(
				mock
					? `${added} mock Wanted player${added === 1 ? `` : `s`} added.`
					: `${added} player${added === 1 ? `` : `s`} sent to the Community Hivemind.`,
			);
			return [];
		} catch (error) {
			addError =
				error instanceof Error ?
					error.message
				:	`Wanted player could not be added.`;
			notifyError(addError);
			return [];
		} finally {
			addBusy = false;
		}
	}
</script>

<section class="panel-view player-list" aria-label="Wanted players">
	<WantedAmbient />
	<PanelHeader title="Wanted" eyebrow="Community Hivemind">
		<svelte:fragment slot="trailing">
			{#if tab === `players`}
				{#if $authState.user?.wantedCreationEnabled}
					<IconButton
						icon="fa-plus"
						ariaLabel="Add wanted player"
						tooltip="Add wanted player"
						onClick={() => (adding = true)}
					/>
				{:else}
					<IconButton
						icon="fa-rotate"
						ariaLabel="Refresh wanted players"
						tooltip="Refresh wanted players"
						disabled={loading}
						onClick={() => (refreshRevision += 1)}
					/>
				{/if}
				{#if !isSearch}<span>{currentPage} / {Math.max(1, totalPages)}</span
					>{/if}
				<time>{lastRefresh}</time>
			{/if}
		</svelte:fragment>
	</PanelHeader>

	<div class="wanted-content">
		<Tabs
			items={tabs}
			value={tab}
			label="Wanted status"
			onChange={(value) =>
				void navigation.visit(() => {
					tab = value;
				})}
		>
			{#if tab === `players`}
				<div class="wanted-players">
					<div class="wanted-intro">
						<InfoNotice
							message="Wanted tracks players reported for cheating or hacking. The Hivemind automatically coordinates bans when admins encounter them in-game."
						/>
						{#if $authState.user && !$authState.user.wantedCreationEnabled}
							<div class="wanted-permission-banner" role="status">
								<i class="fa-solid fa-triangle-exclamation" aria-hidden="true"
								></i>
								<span
									>Adding Wanted players is disabled for your account. You can
									still view Wanted players & autoban existing entries, but your
									bans marked as 'cheater' are performed as local bans.</span
								>
							</div>
						{/if}
					</div>
					<PlayerArchive
						active={isActive}
						source="wanted"
						{refreshRevision}
						onSelect={onSelectPlayer}
						onOpenProfile={onOpenPlayerProfile}
						onResult={handleResult}
						onWantedMutated={() => (refreshRevision += 1)}
						{session}
					/>
				</div>
			{:else}
				<div class="wanted-history"><Wip /></div>
			{/if}
		</Tabs>
	</div>

	{#if adding}
		<WantedAddModal
			isSuperadmin={Boolean($authState.user?.isSuperadmin)}
			busy={addBusy}
			error={addError}
			onAdd={add}
			onCancel={() => {
				if (!addBusy) adding = false;
			}}
		/>
	{/if}
</section>

<style lang="scss">
	.player-list {
		position: relative;
		box-sizing: border-box;
		padding-top: var(--gutter-lg);
		height: 100%;
		display: grid;
		grid-template-rows: auto minmax(0, 1fr);
		align-content: start;
		gap: var(--gutter-lg);
	}
	.player-list > :global(*) {
		position: relative;
		z-index: 1;
	}
	.player-list > :global(.wanted-ambient) {
		position: absolute;
		z-index: 0;
	}
	.wanted-content,
	.wanted-players {
		min-height: 0;
		display: grid;
	}
	.wanted-players {
		grid-template-rows: auto minmax(0, 1fr);
		gap: var(--gutter-lg);
	}
	.wanted-content :global(.tabs) {
		min-height: 0;
		grid-template-rows: auto minmax(0, 1fr);
	}
	.wanted-content :global(.tabs__panel) {
		min-height: 0;
		grid-template-rows: minmax(0, 1fr);
	}
	.wanted-content :global(.tabs__list),
	.wanted-intro,
	.wanted-history {
		margin: 0 var(--gutter-lg);
	}
	.wanted-intro {
		display: grid;
		gap: var(--gutter-md);
	}
	.wanted-permission-banner {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		align-items: start;
		gap: var(--gutter-md);
		border: 1px solid var(--color-accent-tertiary);
		border-radius: var(--radius);
		padding: var(--gutter-md);
		color: var(--color-light-secondary);
		background: rgbaa(var(--color-accent-tertiary), 0.08);
		font-size: var(--font-size-xs);
		line-height: 1.5;
	}
	.wanted-permission-banner i {
		color: var(--color-accent-tertiary);
	}
</style>
