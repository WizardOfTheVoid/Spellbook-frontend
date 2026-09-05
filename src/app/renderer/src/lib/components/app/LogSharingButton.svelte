<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte'
  import { notifyError, notifySuccess } from '$lib/notifications/notificationEvents'

  let exporting = false

  async function shareLogs(): Promise<void> {
    if (exporting) return
    exporting = true
    try {
      const result = await window.chivDiagnostics?.exportLogs()
      if (result?.status === `saved`) notifySuccess(`Logs saved. Attach the file to your Discord bug report.`)
      else if (result?.status !== `cancelled`) notifyError(`Could not save logs. Please try again.`)
    } catch {
      notifyError(`Could not save logs. Please try again.`)
    } finally {
      exporting = false
    }
  }
</script>

<Button
  label={exporting ? `Saving logs…` : `Share logs`}
  icon="fa-file-arrow-down"
  disabled={exporting}
  tooltip="Save diagnostic logs to attach to a Discord bug report."
  onClick={() => void shareLogs()}
/>
