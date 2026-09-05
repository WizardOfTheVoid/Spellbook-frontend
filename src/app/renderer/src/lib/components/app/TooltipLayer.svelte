<script lang="ts">
	import { browser } from "$app/environment";
	import { tick } from "svelte";
	import { tooltipState, type TooltipSnapshot } from "$lib/utils/tooltip";
	import { placeAnchoredOverlay } from "$lib/utils/overlayPosition"

	const VIEWPORT_MARGIN = 12;
	const TOOLTIP_GAP = 12;

	let tooltipNode: HTMLDivElement;
	let left = 0;
	let top = 0;
	let isPositioned = false;
	let positionRequestId = 0;

	$: currentTooltip = $tooltipState;
	$: if (browser && currentTooltip) {
		void positionTooltip(currentTooltip);
	}

	async function positionTooltip(snapshot: TooltipSnapshot): Promise<void> {
		const requestId = (positionRequestId += 1);
		isPositioned = false;
		await tick();

		if (requestId !== positionRequestId || !tooltipNode) {
			return;
		}

		const tooltipRect = tooltipNode.getBoundingClientRect();
		const position = placeAnchoredOverlay(
			snapshot.anchor,
			{ width: tooltipRect.width, height: tooltipRect.height },
			{ width: window.innerWidth, height: window.innerHeight },
			snapshot.placement,
			TOOLTIP_GAP,
			VIEWPORT_MARGIN,
		)
		left = position.x;
		top = position.y;
		isPositioned = true;
	}
</script>

{#if currentTooltip}
	<div
		bind:this={tooltipNode}
		class="tooltip-layer"
		class:tooltip-layer--visible={isPositioned}
		class:tooltip-layer--emphasized={Boolean(currentTooltip.emphasis)}
		style={`left: ${left}px; top: ${top}px;`}
		role="tooltip"
	>
		{#if currentTooltip.emphasis}
			<span>{currentTooltip.text}</span><strong>{currentTooltip.emphasis}</strong>
		{:else}
			{currentTooltip.text}
		{/if}
	</div>
{/if}
