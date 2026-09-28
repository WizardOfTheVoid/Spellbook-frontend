<script lang="ts">
	import type { PlayerState } from "$lib/types/playerState";
	import { createPlayerArchiveSession, type PlayerArchiveResult, type PlayerArchiveSession } from "$lib/utils/playerArchive";
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
	import WantedEvidenceWizard from "./wantedEvidenceWizard.svelte";
	import WantedCandidateDetail from "./wantedCandidateDetail.svelte";
	import { navigation, rememberNavigation } from "$lib/navigation/navigation";
	import type { EvidencePlayerSelection } from './evidence/navigation'

	export let isActive = false;
	export let onSelectPlayer: (player: PlayerState) => void;
	export let onOpenPlayerProfile: (player: PlayerState) => void;
	export let session: PlayerArchiveSession | null = null;
	export let openCandidateId: number | null = null
	export let openCandidateEvidenceId: number | null = null
	export let onOpenCandidateHandled: () => void = () => {}
	export let uploadPlayer: EvidencePlayerSelection | null = null
	export let uploadRequestId = 0
	export let onClearUploadRequest: () => void = () => {}

	let canReview = false
	let tabs: Array<{ value: string, label: string }> = []
	$: canReview = Boolean($authState.user?.isSuperadmin || $authState.user?.wantedCreationEnabled)
	$: tabs = [
		{ value: `players`, label: `Wanted players` },
		...(canReview ? [{ value: `candidates`, label: `Candidates` }] : []),
		{ value: `submit`, label: `Submit evidence` }
	]
	let tab = `players`;
	let candidateId: number | null = null
	let handledOpenCandidateId: number | null = null
	let handledUploadRequestId = 0
	let candidateSession = createPlayerArchiveSession(`candidates`)
	$: if (!canReview && tab === `candidates`) { tab = `players`; candidateId = null }
	$: if (canReview && openCandidateId && openCandidateId !== handledOpenCandidateId) {
		handledOpenCandidateId = openCandidateId
		candidateId = openCandidateId
		tab = `candidates`
		onOpenCandidateHandled()
	}
	$: if (openCandidateId === null) handledOpenCandidateId = null
	$: if (uploadRequestId && uploadRequestId !== handledUploadRequestId) {
		handledUploadRequestId = uploadRequestId
		tab = `submit`
	}
	rememberNavigation(
		`wantedTab`,
		() => ({ tab, candidateId }),
		(value) => {
			({ tab, candidateId } = value)
		},
		value => [value.tab, value.candidateId],
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

	async function add(playfabIds: string, mock: boolean, source: string): Promise<string[]> {
		if (addBusy) return [];
		addBusy = true;
		addError = null;
		try {
			const { added, failed } = await addWantedPlayers(playfabIds, mock, source, createWantedPlayer)
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
				{#if canReview}
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
					onClearUploadRequest()
					tab = value;
				})}
			onReselect={value => {
				if (value === `candidates` && candidateId) void navigation.visit(() => candidateId = null)
				else if (value === `submit` && uploadRequestId) void navigation.visit(onClearUploadRequest)
			}}
		>
			{#if tab === `players`}
				<div class="wanted-players">
					<div class="wanted-intro">
						<InfoNotice
							message="Wanted tracks players reported for cheating or hacking. The Hivemind automatically coordinates bans when admins encounter them in-game."
						/>
						{#if $authState.user && !canReview}
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
			{:else if tab === `candidates` && canReview}
				{#if candidateId}
					<WantedCandidateDetail {candidateId} openEvidenceId={openCandidateEvidenceId} onDecided={() => { candidateId = null; refreshRevision += 1 }} />
				{:else}
					<PlayerArchive active={isActive} source="candidates" {refreshRevision}
						onSelect={onSelectPlayer} onOpenProfile={onOpenPlayerProfile}
						onSelectCandidate={candidate => void navigation.visit(() => candidateId = candidate.candidateId)}
						session={candidateSession} />
				{/if}
			{:else}
				{#key uploadRequestId}<WantedEvidenceWizard initialPlayer={uploadPlayer} onSubmitted={() => refreshRevision += 1} />{/key}
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
	.wanted-intro {
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
