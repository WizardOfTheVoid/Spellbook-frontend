<script lang="ts">
	import {
		extractEnvelope,
		formatJson,
		getCoreApi,
		getCoreErrorMessage,
	} from "$lib/core";
	import type { CoreCallResult } from "$lib/core";
	import { notifyError } from "$lib/notifications/notificationEvents";
	import type { LoadState } from "$lib/types/ui";
	import { getRecordField, isRecord } from "$lib/utils/records";
	import IconButton from "$lib/components/ui/IconButton.svelte";
	import PanelHeader from "$lib/components/ui/PanelHeader.svelte";
	import HealthCardGrid from "./HealthCardGrid.svelte";

	export let hidden = false;
	export let isActive = false;
	export let onBack: (() => void) | null = null

	let healthState: LoadState = "idle";
	let healthResult: CoreCallResult | null = null;
	let wasActive = false;

	$: healthEnvelope = extractEnvelope<unknown>(healthResult);
	$: healthData = isRecord(healthEnvelope?.data) ? healthEnvelope.data : null;
	$: overlayHealth = getRecordField(healthData, "overlay");
	$: coreHealth = getRecordField(healthData, "core");
	$: serverHealth = getRecordField(healthData, "server");
	$: databaseHealth = getRecordField(healthData, "database");
	$: playFabHealth = getRecordField(healthData, "playfab");
	$: tornBannerHealth = getRecordField(healthData, "tornBanner");
	$: gameHealth = getRecordField(healthData, "game");

	$: if (isActive && !wasActive) {
		wasActive = true;
		void loadHealth();
	} else if (!isActive && wasActive) {
		wasActive = false;
	}

	async function loadHealth(): Promise<void> {
		healthState = "loading";

		try {
			const result = await getCoreApi().health();
			const envelope = extractEnvelope<unknown>(result);
			healthResult = result;

			if (!result.ok || envelope?.ok === false) {
				throw new Error(getCoreErrorMessage(result, "Health request failed."));
			}

			healthState = "ok";
		} catch (error) {
			notifyError(
				error instanceof Error ? error.message : "Health request failed.",
				{
					dedupeKey: "health:error",
				},
			);
			healthState = "error";
		}
	}
</script>

<section {hidden} class="panel-view health-view" aria-label="Core health">
	<PanelHeader
		title="Health"
		eyebrow="Core"
		leadingIcon={onBack ? "fa-arrow-left" : null}
		leadingLabel="Back to admin"
		onLeading={onBack}
	>
		<svelte:fragment slot="subtitle">
			<div class="health-view__status">
				<strong
					>{healthState.toUpperCase()} | {healthResult?.status ?? 0}</strong
				>
				<time>{healthEnvelope?.timestampUtc ?? "No timestamp"}</time>
			</div>
		</svelte:fragment>
		<svelte:fragment slot="trailing">
			<IconButton
				icon="fa-rotate"
				ariaLabel="Refresh health"
				disabled={healthState === "loading"}
				onClick={loadHealth}
			/>
		</svelte:fragment>
	</PanelHeader>

	<div class="health-view__body">
		<HealthCardGrid
			{overlayHealth}
			{coreHealth}
			{serverHealth}
			{databaseHealth}
			{playFabHealth}
			{tornBannerHealth}
			{gameHealth}
		/>

		<pre class="health-view__json">{formatJson(
				healthResult?.data ?? healthResult,
			)}</pre>
	</div>
</section>

<style lang="scss">
	.health-view {
		box-sizing: border-box;
		height: 100%;
		display: grid;
		grid-template-rows: auto minmax(0, 1fr);
		gap: var(--gutter-lg);
		padding-top: var(--gutter-lg);
	}

	.health-view__body {
		min-height: 0;
		display: grid;
		align-content: start;
		gap: var(--gutter-lg);
		padding: 0 var(--gutter-lg) var(--gutter-lg);
		overflow: auto;
	}

	.health-view__status {
		display: flex;
		align-items: center;
		gap: var(--gutter-md);
	}

	.health-view__json {
		min-height: 0;
		margin: 0;
		border: 1px solid var(--color-dark-secondary);
		border-radius: var(--radius);
		padding: var(--gutter-lg);
		color: var(--color-light-primary);
		background: var(--color-dark-primary);
		font-size: var(--font-size-xs);
		overflow: auto;
	}
</style>
