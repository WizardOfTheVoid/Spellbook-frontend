<script lang="ts">
  import Toggle from '$lib/components/ui/Toggle.svelte'
  import { getTelemetrySession } from './telemetrySessionOrchestrator'

  const model = getTelemetrySession()
  const view = model.view
</script>

<Toggle label="Live" checked={$view.source === `live`}
  tooltip="Switch between the live session and saved recordings"
  onChange={live => model.setSource(live ? `live` : `recordings`)} />
