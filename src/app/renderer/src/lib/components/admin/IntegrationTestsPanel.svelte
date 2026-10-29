<script lang="ts">
	import { formatJson, getCoreApi } from "$lib/core"
	import Button from "$lib/components/ui/Button.svelte"
	import Tabs from '$lib/components/ui/tabs.svelte'
	import InputHistoryPanel from './integrationTests/inputHistoryPanel.svelte'
	import CommandOriginPanel from './integrationTests/commandOriginPanel.svelte'
	import PlayerDetectionPanel from './integrationTests/playerDetectionPanel.svelte'
  import { authState } from '$lib/auth/user'

	export let active = false
  $: tabs = [{ value: `native`, label: `Native ListPlayers` }, { value: `input`, label: `Input.ini history` },
    ...($authState.user?.isSuperadmin ? [{ value: `origin`, label: `Command origin` }, { value: `playerDetection`, label: `Player detection` }] : [])]
	let tab = `native`
  $: if (tab === `origin` && !$authState.user?.isSuperadmin) tab = `native`
	let running = false
	let output = "No response yet."

	async function runNativeListPlayers(): Promise<void> {
		running = true
		try {
			output = formatJson(await getCoreApi().nativeListPlayers())
		} catch (error) {
			output = error instanceof Error ? error.message : "Native ListPlayers failed."
		} finally {
			running = false
		}
	}
</script>

<Tabs items={tabs} value={tab} label="Integration tests" onChange={value => { tab = value }}>
	{#if tab === `playerDetection` && $authState.user?.isSuperadmin}
		<PlayerDetectionPanel />
	{:else if tab === `input`}
		<InputHistoryPanel {active} />
	{:else if tab === `origin` && $authState.user?.isSuperadmin}
		<CommandOriginPanel {active} />
	{:else}
		<section class="integration-test">
			<div>
				<h2>Native ListPlayers</h2>
				<p>Calls <code>POST /v2/native/listplayers</code> without keyboard input.</p>
			</div>
			<Button
				label={running ? "Running…" : "Run test"}
				icon="fa-play"
				variant="primary"
				disabled={running}
				onClick={() => void runNativeListPlayers()}
			/>
			<pre>{output}</pre>
		</section>
	{/if}
</Tabs>

<style lang="scss">
	.integration-test {
		display: grid;
		align-content: start;
		justify-items: start;
		gap: var(--gutter-lg);
	}

	h2,
	p,
	pre {
		margin: 0;
	}

	p {
		margin-top: var(--gutter-sm);
		color: var(--color-light-secondary);
		font-size: var(--font-size-xs);
	}

	pre {
		width: 100%;
		min-height: 180px;
		box-sizing: border-box;
		border: 1px solid var(--color-dark-secondary);
		border-radius: var(--radius);
		padding: var(--gutter-lg);
		color: var(--color-light-primary);
		background: var(--color-dark-primary);
		font-size: var(--font-size-xs);
		overflow: auto;
	}
</style>
