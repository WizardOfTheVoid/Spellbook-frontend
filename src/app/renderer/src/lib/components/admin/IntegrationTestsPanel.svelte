<script lang="ts">
	import { formatJson, getCoreApi } from "$lib/core"
	import Button from "$lib/components/ui/Button.svelte"

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
