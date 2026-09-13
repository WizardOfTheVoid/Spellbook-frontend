<script lang="ts">
	import type { DebugPanelLayout, DebugPanelName } from '../../../../../shared/debug'
	export let name: DebugPanelName
	export let title: string
	export let status = ``
	export let layout: DebugPanelLayout
</script>

{#if layout.visible}
	<section class={`hud-panel hud-panel--${name}`} aria-label={title}
		style={`--x:${layout.x * 100}%;--y:${layout.y * 100}%;--scale:${layout.scale};--opacity:${layout.opacity}`}>
		<header><h2>{title}</h2><span>{status}</span></header>
		<div class="panel-content"><slot /></div>
	</section>
{/if}

<style>
	.hud-panel { position: absolute; box-sizing: border-box; left: var(--x); top: var(--y); width: 390px; max-width: calc(94vw / var(--scale)); transform: translate(calc(-1 * var(--x)), calc(-1 * var(--y))) scale(var(--scale)); transform-origin: var(--x) var(--y); opacity: var(--opacity); border: 1px solid #d2e1ff30; border-radius: 9px; background: #090f19f5; color: #d6dde8; font: 11px/1.45 Consolas, monospace; box-shadow: 0 4px 18px #0005; overflow: hidden; }
	.hud-panel--state { width: 510px; }
	.hud-panel--events { width: 510px; }
	.hud-panel--tests { width: 390px; }
	header { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 9px 12px; background: #ffffff07; border-bottom: 1px solid #ffffff1a; }
	h2 { color: #e8ca76; font-size: 12px; font-weight: normal; margin: 0; letter-spacing: .04em; }
	header span { font-size: 10px; color: #aab5c5; }
	.panel-content { padding: 10px 12px; min-width: 0; }
</style>
