<script lang="ts">
  export let onHide: () => void
</script>

<button
  class="app-bg"
  type="button"
  tabindex="-1"
  aria-label="Minimize SpellBook to tray"
  on:click={onHide}
></button>
