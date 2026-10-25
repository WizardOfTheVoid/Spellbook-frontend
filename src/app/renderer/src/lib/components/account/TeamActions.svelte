<script lang="ts">
  import IconButton from "$lib/components/ui/IconButton.svelte"
  export let busy = false
  export let onSettings: () => void
</script>

<IconButton icon="fa-gear" ariaLabel="Team settings" disabled={busy} onClick={onSettings} />
