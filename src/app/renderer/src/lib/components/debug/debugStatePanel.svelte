<script lang="ts">
	import type { CoreDebugSnapshot } from '../../../../../shared/debug'
	import type { GameActivitySnapshot } from '../../../../../shared/gameActivity'
	import { debugSeconds } from './debugEditor'
	export let core: CoreDebugSnapshot | null
	export let appCpuPercent: number | null = null
	const percent = (value: number | null | undefined): string => typeof value === `number` && Number.isFinite(value) ? `${Math.round(value)}%` : `—`
	export let activity: GameActivitySnapshot | null = null
	$: status = core?.status
	const details = (value: Record<string, unknown> | undefined): string => value ? Object.entries(value).map(([key, item]) => `${key}=${typeof item === `object` ? JSON.stringify(item) : item}`).join(` · `) : `—`
</script>

<div class="state-columns">
	<section><h3>Runtime &amp; windows</h3><dl>
		<dt>Core CPU</dt><dd>{percent(core?.cpuPercent)}</dd>
		<dt>App CPU</dt><dd>{percent(appCpuPercent)}</dd>
		<dt>Enabled</dt><dd>{status?.runtime.enabled ?? `—`}</dd>
		<dt>Game / app running</dt><dd>{status?.runtime.gameRunning ?? `—`} / {status?.runtime.appRunning ?? `—`}</dd>
		<dt>gameFocused</dt><dd>{status?.focus.gameFocused ?? `—`}</dd>
		<dt>appFocused</dt><dd>{status?.focus.appFocused ?? `—`}</dd>
		<dt>gameReady</dt><dd class:active={status?.focus.gameReady}>{status?.focus.gameReady ?? `—`}</dd>
		<dt>Steam overlay</dt><dd>{status?.focus.overlayState === `unknown` ? `unverified` : status?.focus.overlayState ?? `—`}</dd>
	</dl></section>
	<section><h3>Game input</h3><dl>
		<dt>Available</dt><dd>{status?.input.available ?? `—`}</dd>
		<dt>Keyboard / mouse</dt><dd>{status?.input.keyboardActive ?? `—`} / {status?.input.mouseActive ?? `—`}</dd>
		<dt>isMoving</dt><dd>{core ? activity?.isMoving ?? (status?.input.keyboardActive || status?.input.mouseActive) : `—`}</dd>
		<dt>Idle / isAfk</dt><dd>{debugSeconds(status?.input.idleMs)} / {core ? activity?.isAfk ?? `—` : `—`}</dd>
		<dt>isChatting()</dt><dd class:active={status?.input.isChatting}>{status?.input.isChatting ?? `—`}</dd>
		<dt>Chat cooldown</dt><dd>{debugSeconds(status?.input.chatCooldownRemainingMs)}</dd>
		<dt>timeSinceChatting()</dt><dd>{debugSeconds(status?.input.timeSinceChattingMs)}</dd>
		<dt>timeSinceMovement</dt><dd>{debugSeconds(status?.input.idleMs)}</dd>
	</dl></section>
</div>
<div class="gate"><dl>
	<dt>Ordinary gate</dt><dd class:active={core?.ordinaryGate?.canExecuteCommand}>{core?.ordinaryGate?.canExecuteCommand ?? `—`} · {core?.ordinaryGate?.reason ?? `—`}</dd>
	<dt>Effective gate</dt><dd class:active={status?.execution.canExecuteCommand}>{status?.execution.canExecuteCommand ?? `—`} · {status?.execution.reason ?? `—`}</dd>
	<dt>Phase</dt><dd>{core?.execution.phase ?? `—`}</dd>
	<dt>Global held keys / buttons</dt><dd>{core ? core.input.heldKeys.join(`, `) || `none` : `—`} / {core ? core.input.heldButtons.join(`, `) || `none` : `—`}</dd>
	<dt>Injected key / mouse events</dt><dd>{core?.input.injectedKeyboardEvents ?? `—`} / {core?.input.injectedMouseEvents ?? `—`}</dd>
</dl></div>
{#if status?.focus.reason}<p class="reason">Readiness: {status.focus.reason}</p>{/if}
<p class="window-detail">Game: {details(core?.windows.game)}</p>
<p class="window-detail">App: {details(core?.windows.app)}</p>
{#if status?.focus.overlayState === `unknown`}<p class="limitation">{status.focus.limitation ?? `Windows readiness does not verify Steam overlay visibility.`}</p>{/if}
<div class="recent-commands">
	<h3>Last 3 commands</h3>
	{#each status?.recentCommands ?? [] as command}
		<p>{debugSeconds(command.timeSinceMs)} ago: {command.command}</p>
	{:else}
		<p>—</p>
	{/each}
</div>

<style>
	.state-columns { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
	section { min-width: 0; }
	h3 { margin: 0 0 5px; color: #8995a8; font-size: 10px; font-weight: normal; }
	dl { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 2px 8px; margin: 0; }
	dt { color: #aab5c5; }
	dd { margin: 0; text-align: right; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.active { color: #e8ca76; }
	.gate, .recent-commands { margin-top: 8px; padding-top: 8px; border-top: 1px solid #ffffff1a; }
	p { margin: 6px 0 0; overflow-wrap: anywhere; }
	.reason { color: #e0a59d; }
	.window-detail { font-size: 10px; color: #8995a8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.limitation { color: #c5af83; font-size: 10px; }
	.recent-commands p { display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
</style>
