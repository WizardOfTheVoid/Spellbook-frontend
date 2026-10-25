<script lang="ts">
  import { playerDetectionRuns } from '$lib/snapshot/playerDetectionRuns'
  const time = (value: number) => `${(value / 1000).toFixed(2)} s`
  const cost = (value: number | null) => value === null ? `Not reported` : `$${value.toFixed(8)}`
</script>

<section>
  <h2>Player detection</h2>
  <p>Aim at a player in the game and press your Quick Open Player key (F4 by default). Results appear here.</p>
  <p>Costs are reported in USD. Failed requests may have an unreported cost.</p>
  {#if !$playerDetectionRuns.length}
    <p>No runs yet.</p>
  {:else}
    <div class="runs">
      <table>
        <thead><tr><th>Time</th><th>Player</th><th>Result</th><th>Confidence</th><th>Total</th><th>Capture</th><th>Player list</th><th>Request</th><th>Matching</th><th>Cost (USD)</th><th>Input tokens</th></tr></thead>
        <tbody>
          {#each $playerDetectionRuns as run (run.requestId)}
            <tr>
              <td>{new Date(run.startedAt).toLocaleTimeString()}</td><td>{run.playerName ?? `—`}</td><td>{run.outcome}</td>
              <td>{run.confidence === null ? `—` : `${Math.round(run.confidence * 100)}%`}</td>
              <td>{time(run.totalMs)}</td><td>{time(run.captureMs)}</td><td>{time(run.rosterMs ?? 0)}</td><td>{time(run.requestMs)}</td>
              <td>{run.inferenceMs === null ? `—` : time(run.inferenceMs)}</td><td>{cost(run.costUsd)}</td><td>{run.inputTokens ?? `—`}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</section>

<style>
  section { display: grid; gap: var(--gutter-lg); }
  h2, p { margin: 0; }
  p { color: var(--color-light-secondary); }
  .runs { overflow: auto; }
  table { border-collapse: collapse; width: 100%; font-size: var(--font-size-xs); }
  th, td { padding: var(--gutter-sm); text-align: left; white-space: nowrap; border-bottom: 1px solid var(--color-dark-secondary); }
</style>
