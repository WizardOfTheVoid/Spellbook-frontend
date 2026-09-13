<script lang="ts">
	import type { DashboardSeries } from "$lib/core"

	export let labels: readonly string[]
	export let series: readonly DashboardSeries[]

	const width = 720
	const height = 220
	const insetX = 24
	const insetY = 24
	const firstSeriesHue = 264
	$: maximum = Math.max(1, ...series.flatMap(item => item.values))
	$: seriesColors = assignSeriesColors(series)

	function points(values: readonly number[]): string {
		return values.map((value, index) => {
			const x = insetX + index * ((width - insetX * 2) / Math.max(1, values.length - 1))
			const y = height - insetY - value / maximum * (height - insetY * 2)
			return `${x.toFixed(1)},${y.toFixed(1)}`
		}).join(" ")
	}

	function color(item: DashboardSeries): string {
		return seriesColors.get(item.id)!
	}

	function assignSeriesColors(items: readonly DashboardSeries[]): Map<string, string> {
		const colors = new Map<string, string>()
		const orderedItems = [...items]
			.sort((left, right) => left.id.localeCompare(right.id))
		const hueStep = 360 / orderedItems.length
		for (const [index, item] of orderedItems.entries()) {
			const hue = (firstSeriesHue + index * hueStep) % 360
			colors.set(item.id, hueColor(hue))
		}

		return colors
	}

	function hueColor(hue: number): string {
		return `hsl(${hue} 82% 64%)`
	}
</script>

<div class="dashboard-timeline">
	<div class="dashboard-timeline__legend" aria-label="Timeline series">
		{#each series as item (item.id)}
			<span><i style={`--series-color: ${color(item)}`}></i>{item.label}</span>
		{/each}
	</div>
	<svg viewBox={`0 0 ${width} ${height + 24}`} role="img" aria-labelledby="dashboard-timeline-title">
		<title id="dashboard-timeline-title">Player actions timeline</title>
		<g class="dashboard-timeline__grid"><path d="M24 24H696M24 80H696M24 136H696M24 192H696" /></g>
		{#each series as item (item.id)}
			<polyline
				class:dashboard-timeline__line--average={item.kind === "global-average"}
				class="dashboard-timeline__line"
				style={`--series-color: ${color(item)}`}
				points={points(item.values)}
			/>
		{/each}
		{#each labels as label, index}
			<text x={insetX + index * ((width - insetX * 2) / Math.max(1, labels.length - 1))} y={height + 16} text-anchor={index === 0 ? "start" : index === labels.length - 1 ? "end" : "middle"}>{label}</text>
		{/each}
	</svg>
</div>

<style lang="scss">
	.dashboard-timeline { display: grid; gap: var(--gutter-md); }
	.dashboard-timeline svg { width: 100%; height: auto; overflow: visible; }
	.dashboard-timeline__legend { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: var(--gutter-sm) var(--gutter-md); }
	.dashboard-timeline__legend span { display: flex; align-items: center; gap: 5px; color: var(--color-light-tertiary); font-size: 10px; }
	.dashboard-timeline__legend i { width: 8px; height: 8px; border-radius: 50%; background: var(--series-color); }
	.dashboard-timeline__grid path { fill: none; stroke: rgbaa(var(--color-light-tertiary), 0.1); stroke-width: 1; }
	.dashboard-timeline__line { fill: none; stroke: var(--series-color); stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
	.dashboard-timeline__line--average { stroke-dasharray: 7 7; }
	text { fill: var(--color-light-tertiary); font-size: 9px; }
</style>
