<script lang="ts">
	/** Renders the registered `<Legend />` slot as an HTML box outside the plot area. */
	import {
		ChartLegendContent,
		resolveLegendPlacement,
		type LegendPayloadItem,
		type LegendVerticalAlign
	} from '$lib/components/evilcharts/ui/layerchart-legend/index.js';
	import { useBarChart } from './bar-chart-context.svelte.js';

	let { placement }: { placement: LegendVerticalAlign } = $props();

	const chart = useBarChart();

	const slot = $derived(chart.slots.legend);
	const resolvedPlacement = $derived(resolveLegendPlacement(slot?.verticalAlign, 'top'));

	const payload = $derived<LegendPayloadItem[]>(
		(slot?.onToggle ? Object.keys(chart.config) : chart.seriesKeys).map((key) => ({ dataKey: key, value: key }))
	);
	function toggle(key: string) {
		chart.selectDataKey(null)
		chart.slots.legend?.onToggle?.(key)
	}
</script>

{#if slot && !chart.isLoading && resolvedPlacement === placement}
	<ChartLegendContent
		{payload}
		hiddenKeys={slot.hiddenKeys}
		preserveOrder={slot.preserveOrder}
		onToggle={slot.onToggle ? toggle : undefined}
		verticalAlign={slot.verticalAlign}
		align={slot.align}
		variant={slot.variant}
		isClickable={slot.isClickable}
		selected={chart.selectedDataKey}
		onSelectChange={chart.selectDataKey}
		class={placement === 'middle'
			? 'pointer-events-auto absolute inset-x-[5px] top-1/2 z-10 -translate-y-1/2'
			: placement === 'top'
				? 'pointer-events-auto absolute inset-x-[5px] top-[5px] z-10'
				: 'pointer-events-auto absolute inset-x-[5px] bottom-[5px] z-10'}
	/>
{/if}
