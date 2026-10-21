<script lang="ts">
	import type { CoreCommand } from '../../../../../shared/coreAction'
	import consoleKeys from '../../../../../../../packages/shared/assets/consoleKeys.json'
	import { moveCommand } from './debugEditor'

	export let commands: CoreCommand[]
	export let disabled = false

	function add(type: CoreCommand[`type`]): void {
		commands = [...commands, type === `keys`
			? { type, presses: [{ virtualKey: 78, durationMs: 50 }], minimumIdleMs: 0, delayMs: 0 }
			: { type, command: `ListPlayers`, consoleKey: `NumpadSubtract`, delayMs: 0, expectClipboard: false, restoreClipboard: true }]
	}
</script>

<div class="command-list">
	{#each commands as command, index}
		<fieldset {disabled} class="command">
			<legend>Command {index + 1} · {command.type}</legend>
			<div class="toolbar">
				<button type="button" aria-label={`Move command ${index + 1} up`} disabled={index === 0} on:click={() => commands = moveCommand(commands, index, -1)}>↑</button>
				<button type="button" aria-label={`Move command ${index + 1} down`} disabled={index === commands.length - 1} on:click={() => commands = moveCommand(commands, index, 1)}>↓</button>
				<button type="button" on:click={() => commands = commands.filter((_, item) => item !== index)}>Delete</button>
			</div>
			{#if command.type === `console`}
				<label>Console command<input bind:value={command.command} /></label>
				<div class="fields">
					<label>Console key<select bind:value={command.consoleKey}>{#each Object.entries(consoleKeys) as [code, key]}<option value={code}>{key.label}</option>{/each}</select></label>
					<label>Delay before (ms)<input type="number" min="0" max="2147483647" bind:value={command.delayMs} /></label>
				</div>
				<div class="toolbar">
					<label class="check"><input type="checkbox" bind:checked={command.expectClipboard} /> Expect clipboard output</label>
					<label class="check"><input type="checkbox" bind:checked={command.restoreClipboard} /> Restore clipboard</label>
				</div>
			{:else}
				{#each command.presses as press, pressIndex}
					<div class="fields press">
						<label>Virtual key (decimal)<input type="number" min="1" max="254" bind:value={press.virtualKey} /></label>
						<label>Hold (ms)<input type="number" min="0" max="60000" bind:value={press.durationMs} /></label>
						<button type="button" aria-label={`Delete press ${pressIndex + 1}`} disabled={command.presses.length === 1} on:click={() => command.presses = command.presses.filter((_, item) => item !== pressIndex)}>Delete press</button>
					</div>
				{/each}
				<button type="button" on:click={() => command.presses = [...command.presses, { virtualKey: 78, durationMs: 50 }]}>Add key press</button>
				<div class="fields">
					<label>Minimum idle (ms)<input type="number" min="0" max="2147483647" bind:value={command.minimumIdleMs} /></label>
					<label>Delay before (ms)<input type="number" min="0" max="2147483647" bind:value={command.delayMs} /></label>
				</div>
			{/if}
		</fieldset>
	{/each}
	<div class="toolbar"><button type="button" {disabled} on:click={() => add(`keys`)}>Add keys command</button><button type="button" {disabled} on:click={() => add(`console`)}>Add console command</button></div>
</div>

<style>
	.command-list { display: grid; gap: 12px; }
	.command { min-width: 0; margin: 0; padding: 12px; border: 1px solid #ffffff26; border-radius: 8px; display: grid; gap: 10px; }
	legend { padding: 0 6px; color: #e8ca76; }
	.fields, .toolbar { display: flex; flex-wrap: wrap; align-items: end; gap: 10px; }
	.fields > label { flex: 1; min-width: 130px; }
	label { display: grid; gap: 5px; }
	.check { display: flex; align-items: center; }
	input:not([type=checkbox]), select { width: 100%; min-width: 0; }
</style>
