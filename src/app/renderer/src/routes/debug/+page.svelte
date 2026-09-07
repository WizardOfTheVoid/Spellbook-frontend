<script lang="ts">
	import { onMount } from 'svelte'
	import type { GameActivitySnapshot } from '../../../../shared/gameActivity'

	let activity: GameActivitySnapshot | null = null
	onMount(() => window.chivDebug?.onActivity(value => { activity = value }))
	const milliseconds = (value: number | null | undefined): string => value === null || value === undefined ? `—` : `${Math.floor(value)} ms`
</script>

<div class="debug-status" aria-label="Game activity debug">
	<div class="title">Debug <span>{activity ? `Live` : `Unavailable`}</span></div>
	<dl>
		<dt>isMoving</dt><dd class:active={activity?.isMoving}>{activity?.isMoving ?? `—`}</dd>
		<dt>isChatting()</dt><dd class:active={activity?.isChatting}>{activity?.isChatting ?? `—`}</dd>
		<dt>Chat cooldown</dt><dd>{activity ? `${(activity.chatCooldownRemainingMs / 1000).toFixed(1)} s` : `—`}</dd>
		<dt>timeSinceChatting()</dt><dd>{milliseconds(activity?.timeSinceChattingMs)}</dd>
		<dt>timeSinceMovementMs</dt><dd>{milliseconds(activity?.timeSinceMovementMs)}</dd>
	</dl>
</div>

<style>
	:global(html), :global(body) { margin: 0; width: 100%; height: 100%; background: transparent; overflow: hidden; }
	.debug-status { box-sizing: border-box; width: 100%; height: 154px; padding: 12px 14px; border: 1px solid #ffffff26; border-radius: 8px; background: #090e17eb; color: #d6dde8; font: 12px/1.5 Consolas, monospace; }
	.title { display: flex; justify-content: space-between; margin-bottom: 6px; color: #e8ca76; }
	.title span { color: #8995a8; font-size: 11px; }
	dl { display: grid; grid-template-columns: 1fr auto; gap: 2px 12px; margin: 0; }
	dt { color: #aab5c5; }
	dd { margin: 0; text-align: right; font-variant-numeric: tabular-nums; }
	dd.active { color: #e8ca76; }
</style>
