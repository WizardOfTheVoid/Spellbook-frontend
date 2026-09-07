<script lang="ts">
	import { onMount } from 'svelte'
	import type { GameActivitySnapshot } from '../../../../shared/gameActivity'

	let activity: GameActivitySnapshot | null = null
	onMount(() => window.chivDebug?.onActivity(value => { activity = value }))
	const seconds = (value: number | null | undefined): string => value === null || value === undefined ? `—` : `${Math.floor(value / 1000)}s`
</script>

<div class="debug-status" aria-label="Game activity debug">
	<div class="title">Debug <span>{activity ? `Live` : `Unavailable`}</span></div>
	<dl>
		<dt>gameFocused</dt><dd class:active={activity?.gameFocused}>{activity?.gameFocused ?? `—`}</dd>
		<dt>overlayFocused</dt><dd class:active={activity?.overlayFocused}>{activity?.overlayFocused ?? `—`}</dd>
		<dt>isMoving</dt><dd class:active={activity?.isMoving}>{activity?.isMoving ?? `—`}</dd>
		<dt>isAfk</dt><dd class:active={activity?.isAfk}>{activity?.isAfk ?? `—`}</dd>
		<dt>isChatting()</dt><dd class:active={activity?.isChatting}>{activity?.isChatting ?? `—`}</dd>
		<dt>Chat cooldown</dt><dd>{seconds(activity?.chatCooldownRemainingMs)}</dd>
		<dt>timeSinceChatting()</dt><dd>{seconds(activity?.timeSinceChattingMs)}</dd>
		<dt>timeSinceMovement</dt><dd>{seconds(activity?.timeSinceMovementMs)}</dd>
	</dl>
	<div class="last-command" title={activity?.lastCommand?.command}>
		lastCommand - {activity?.lastCommand ? `${seconds(activity.lastCommand.timeSinceMs)} ago: ${activity.lastCommand.command}` : `—`}
	</div>
</div>

<style>
	:global(html), :global(body) { margin: 0; width: 100%; height: 100%; background: transparent; overflow: hidden; }
	.debug-status { box-sizing: border-box; width: 100%; height: 100%; padding: 12px 14px; border: 1px solid #ffffff26; border-radius: 8px; background: #090e17eb; color: #d6dde8; font: 12px/1.5 Consolas, monospace; }
	.title { display: flex; justify-content: space-between; margin-bottom: 6px; color: #e8ca76; }
	.title span { color: #8995a8; font-size: 11px; }
	dl { display: grid; grid-template-columns: 1fr auto; gap: 2px 12px; margin: 0; }
	dt { color: #aab5c5; }
	dd { margin: 0; text-align: right; font-variant-numeric: tabular-nums; }
	dd.active { color: #e8ca76; }
	.last-command { margin-top: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
