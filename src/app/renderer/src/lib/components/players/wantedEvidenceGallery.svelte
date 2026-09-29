<script lang="ts">
	import { onDestroy } from "svelte"
	import type { EvidenceItem } from "$lib/core";
	import { listEvidence } from "$lib/utils/evidenceApi";
	import { formatEvidenceTime } from "./evidence/evidenceTimeline"
	import { getEvidenceGalleryCount } from "./evidence/evidenceGalleryState"
	import Button from "$lib/components/ui/Button.svelte";
	import EmptyState from "$lib/components/ui/EmptyState.svelte";
	import Icon from "$lib/components/ui/Icon.svelte";
	import IconBadge from "$lib/components/ui/IconBadge.svelte";
	import PanelHeader from "$lib/components/ui/PanelHeader.svelte"
	import DateStamp from "$lib/components/ui/dateStamp.svelte"
	import StatChip from "$lib/components/ui/StatChip.svelte"
	import InfoNotice from "$lib/components/ui/infoNotice.svelte"
	import EvidenceViewer from "./evidenceViewer.svelte";
	import EvidenceTags from "./evidence/evidenceTags.svelte";

	export let playerId: number;
	export let openEvidenceId: number | null = null;
	export let onCountChange: (count: number) => void = () => undefined;
	export let evidenceCount: number | null = null;
	export let onSubmit: (() => void) | null = null
	let items: EvidenceItem[] = [];
	let selected: EvidenceItem | null = null;
	let loading = false;
	let error: string | null = null;
	let loadedId = 0;
	let loadRevision = 0;
	let disposed = false;

	$: if (playerId !== loadedId) {
		loadedId = playerId;
		items = []
		selected = null
		void load();
	}
	$: if (openEvidenceId && items.length && selected?.id !== openEvidenceId)
		selected = items.find((item) => item.id === openEvidenceId) ?? null;
	onDestroy(() => {
		disposed = true;
	});

	async function load(): Promise<void> {
		const revision = ++loadRevision;
		loading = true;
		error = null;
		const id = playerId;
		try {
			const loaded = await listEvidence(id);
			if (disposed || playerId !== id || revision !== loadRevision) return;
			items = loaded;
			onCountChange(getEvidenceGalleryCount(items.length, evidenceCount))
			if (selected && !items.some((item) => item.id === selected?.id))
				selected = null;
		} catch (cause) {
			if (!disposed && revision === loadRevision)
				error =
					cause instanceof Error ?
						cause.message
					:	`Evidence could not be loaded.`;
		} finally {
			if (!disposed && revision === loadRevision) loading = false;
		}
	}

	function updateItem(updated: EvidenceItem): void {
		items = items.map((item) => (item.id === updated.id ? updated : item));
	}
</script>

<div class="evidence-gallery">
	<PanelHeader title="Evidence" variant="section">
		<div slot="trailing" class="evidence-gallery__actions">
			{#if onSubmit}
				<Button label="Submit evidence" icon="fa-upload" variant="primary" size="sm" onClick={() => onSubmit?.()} />
			{/if}
			<Button
				label="Refresh"
				icon="fa-rotate"
				size="sm"
				disabled={loading}
				onClick={() => void load()}
			/>
		</div>
	</PanelHeader>
	{#if error}
		<div role="alert"><InfoNotice message={error} /></div>
	{/if}
	{#if !items.length}
		{#if loading}<EmptyState title="Loading evidence" message="Fetching converted evidence..." />
		{:else if !error}<EmptyState title="No evidence yet" message="Admins can add screenshot & video evidence." />{/if}
	{/if}
	<div class="evidence-gallery__grid">
		{#each items as item (item.id)}
			<button
				class="evidence-gallery__card"
				type="button"
				on:click={() => (selected = item)}
			>
				<span class="evidence-gallery__preview">
					{#if item.file.thumbnailSmallUrl || item.file.kind === `image`}<img
							src={item.file.thumbnailSmallUrl ?? item.file.url}
							alt=""
						/>{/if}
					{#if item.file.kind === `video` && !item.file.thumbnailSmallUrl}
						<span class="evidence-gallery__fallback"><Icon name="fa-film" size="lg" /><small>Preview unavailable</small></span>
					{/if}
					{#if item.file.kind === `video` && item.file.thumbnailSmallUrl}<span class="evidence-gallery__play"
							><IconBadge
								name="fa-play"
								size="sm"
								shape="round"
								variant="solid"
								tone="bright"
							/></span
						>{/if}
					<span class="evidence-gallery__kind">
						<Icon name={item.file.kind === `video` ? `fa-film` : `fa-image`} size="xs" />
						{item.file.kind === `video` ? `Video` : `Screenshot`}
						{#if item.file.kind === `video` && item.file.durationMs !== null} · {formatEvidenceTime(item.file.durationMs)}{/if}
					</span>
				</span>
				<span class="evidence-gallery__details">
					<EvidenceTags subtypes={item.subtypes} />
					<span class="evidence-gallery__metadata">
						<strong title={item.nickname || `No nickname listed`}>{item.nickname || `No nickname listed`}</strong>
						<span class="evidence-gallery__stats">
							<small class="evidence-gallery__date"><Icon name="fa-clock" size="xs" /><DateStamp value={item.createdAt} format="relative" styled={false} /></small>
							<StatChip label="Views" icon="fa-eye" value={String(item.viewCount ?? 0)} tone="muted" valueTone="muted" showLabel={false} />
							<StatChip label="Comments" icon="fa-comments" value={String(item.commentCount ?? 0)} tone="muted" valueTone="muted" showLabel={false} />
						</span>
					</span>
					{#if item.duplicateCount > 0}<span class="evidence-gallery__duplicate"
							><IconBadge name="fa-clone" size="sm" tone="warning" /><small
								>Duplicate evidence · {item.duplicateCount} other file{(
									item.duplicateCount === 1
								) ?
									``
								:	`s`}</small
							></span
						>{/if}
				</span>
			</button>
		{/each}
	</div>
</div>
{#if selected}<EvidenceViewer
		evidence={selected}
		{items}
		onUpdated={updateItem}
		onClose={() => {
			selected = null;
			openEvidenceId = null;
		}}
		onDeleted={(id) => {
			const listed = items.some((item) => item.id === id);
			items = items.filter((item) => item.id !== id);
			if (listed) onCountChange(evidenceCount === null ? items.length : Math.max(0, evidenceCount - 1))
			void load();
		}}
	/>{/if}

<style lang="scss">
	.evidence-gallery {
		min-height: 0;
		display: grid;
		align-content: start;
		gap: var(--gutter-md);
	}
	.evidence-gallery__actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--gutter-sm);
	}
	.evidence-gallery__grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--gutter-md);
	}
	.evidence-gallery__card {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: var(--gutter-md);
		text-align: left;
		padding: var(--gutter-md);
		border: 1px solid var(--color-dark-secondary);
		border-radius: var(--radius);
		color: var(--color-light-primary);
		background: rgba(3, 12, 18, 0.36);
		cursor: pointer;
	}
	.evidence-gallery__card:hover {
		border-color: var(--color-accent-primary);
	}
	.evidence-gallery__preview {
		position: relative;
		width: 100%;
		display: grid;
		place-items: center;
		height: 120px;
		border-radius: var(--radius);
		overflow: hidden;
		background: #000;
	}
	.evidence-gallery__preview img {
		width: 100%;
		height: 100%;
		object-fit: contain;
	}
	.evidence-gallery__play {
		position: absolute;
	}
	.evidence-gallery__kind { position: absolute; inset: auto var(--gutter-sm) var(--gutter-sm) auto; display: inline-flex; align-items: center; gap: var(--gutter-sm); padding: 3px 6px; border-radius: var(--radius); background: rgba(0, 0, 0, .8); color: var(--color-light-primary); font-size: var(--font-size-xs); }
	.evidence-gallery__fallback { display: grid; justify-items: center; gap: var(--gutter-sm); color: var(--color-light-tertiary); }
	.evidence-gallery__details {
		min-width: 0;
		width: 100%;
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: var(--gutter-md);
	}
	.evidence-gallery__metadata {
		display: grid;
		gap: var(--gutter-sm);
	}
	.evidence-gallery__metadata strong { min-height: 2.6em; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2; overflow: hidden; overflow-wrap: anywhere; line-height: 1.3; }
	.evidence-gallery__stats {
		display: flex;
		flex-wrap: wrap;
		gap: var(--gutter-sm);
	}
	.evidence-gallery__date {
		flex-basis: 100%;
		display: inline-flex;
		align-items: center;
		gap: var(--gutter-sm);
	}
	small {
		color: var(--color-light-tertiary);
	}
	.evidence-gallery__duplicate {
		margin-top: auto;
		display: flex;
		align-items: center;
		gap: var(--gutter-sm);
		padding-top: var(--gutter-md);
		border-top: 1px solid var(--color-dark-secondary);
	}
	.evidence-gallery__duplicate small {
		color: var(--color-accent-tertiary);
	}
</style>
