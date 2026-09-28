<script lang="ts">
	import type {
		PlayerTimelineEvent,
		PlayerTimelineTarget,
	} from "@spellbook/shared/playerTimeline";
	import type { PlayerAction } from '$lib/core'
	import type { PlayerPresence } from '@spellbook/shared/playerPresence'
	import { onMount } from "svelte";
	import { fetchPlayerTimeline } from "$lib/utils/playerTimelineApi";
	import { formatDateStamp } from '@spellbook/shared/dateFormatting'
	import { loadTimezone, timezone } from '$lib/settings/timezone'
	import Button from "$lib/components/ui/Button.svelte";
	import DateStamp from '$lib/components/ui/dateStamp.svelte'
	import EmptyState from "$lib/components/ui/EmptyState.svelte";
	import PanelHeader from "$lib/components/ui/PanelHeader.svelte";
	import PlayerTimelineCard from "./playerTimelineCard.svelte";
	import { PlayerTimelinePreviewLoader } from './playerTimelinePreview'
	import { timelineWithPresence } from './playerTimelinePresence'

	type TimelineDay = {
		key: string;
		label: string;
		occurredAt: string;
		events: PlayerTimelineEvent[];
	};

	export let playerId: number;
	export let actions: PlayerAction[]
	export let presence: PlayerPresence | null | undefined = null
	export let onOpenTarget: (target: PlayerTimelineTarget) => void;

	let events: PlayerTimelineEvent[] = [];
	let nextCursor: string | null = null;
	let loading = false;
	let error: string | null = null;
	let version = 0;
	$: previewLoader = new PlayerTimelinePreviewLoader(playerId, () => actions)
	$: displayEvents = timelineWithPresence(events, presence)
	$: days = displayEvents.reduce<TimelineDay[]>((groups, event) => {
		const key = formatDateStamp(event.occurredAt, `date`, $timezone)
		const last = groups.at(-1);

		if (last?.key === key) {
			last.events.push(event);
		} else {
			groups.push({
				key,
				label: key,
				occurredAt: event.occurredAt,
				events: [event],
			});
		}

		return groups;
	}, []);

	$: if (playerId) {
		playerId;
		events = [];
		nextCursor = null;
		void load(true);
	}

	onMount(() => {
		void restoreTimezone()
		return () => { version += 1 }
	})

	async function restoreTimezone(): Promise<void> {
		try {
			await loadTimezone()
		} catch (cause) {
			console.warn(`Timeline timezone could not be loaded`, cause)
		}
	}

	async function load(initial = false): Promise<void> {
		if (loading && !initial) return;
		const request = ++version;
		loading = true;
		error = null;

		try {
			const page = await fetchPlayerTimeline(
				playerId,
				initial ? undefined : (nextCursor ?? undefined),
			);
			if (request !== version) return;

			events = initial ? page.events : [...events, ...page.events];
			nextCursor = page.nextCursor;
		} catch (cause) {
			if (request === version)
				error =
					cause instanceof Error ?
						cause.message
					:	`Timeline could not be loaded.`;
		} finally {
			if (request === version) loading = false;
		}
	}
</script>

<div class="player-timeline">
	{#each days as day (day.key)}
		<section class="player-timeline__day" aria-label={day.label}>
			<PanelHeader variant="section" title={day.label}>
				<svelte:fragment slot="title"><DateStamp value={day.occurredAt} format="date" styled={false} /></svelte:fragment>
			</PanelHeader>
			<div class="player-timeline__events">
				{#each day.events as event (event.id)}
					<PlayerTimelineCard {event} {actions} {previewLoader} {onOpenTarget} />
				{/each}
			</div>
		</section>
	{/each}
	{#if error}
		<div class="player-timeline__feedback" role="alert">
			<span>{error}</span>
			<Button label="Retry" icon="fa-rotate" onClick={() => void load(events.length === 0)} />
		</div>
	{/if}

	{#if loading}
		<p class="player-timeline__status" role="status">Loading timeline...</p>
	{/if}

	{#if !loading && !error && displayEvents.length === 0}
		<EmptyState title="No recorded events" message="This player's timeline is empty." />
	{/if}

	{#if nextCursor && !loading}
		<div class="player-timeline__more">
			<Button label="Load older events" icon="fa-clock-rotate-left" onClick={() => void load()} />
		</div>
	{/if}
</div>

<style lang="scss">
	.player-timeline {
		display: grid;
		gap: var(--gutter-lg);
	}

	.player-timeline__day {
		display: grid;
		gap: var(--gutter-md);
	}

	.player-timeline__events {
		display: grid;
	}

	.player-timeline__feedback {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: var(--gutter-md);
		border: 1px solid var(--color-dark-secondary);
		border-radius: var(--radius);
		padding: var(--gutter-md);
		color: var(--color-light-secondary);
	}

	.player-timeline__status {
		margin: 0;
		color: var(--color-light-tertiary);
	}

	.player-timeline__more {
		display: flex;
		justify-content: center;
	}
</style>
