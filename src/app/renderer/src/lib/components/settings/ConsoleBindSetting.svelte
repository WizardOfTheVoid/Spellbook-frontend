<script lang="ts">
  import KeybindSetting from './KeybindSetting.svelte'

  export let disabled = false
  export let hidden = false
  export let busy = false
</script>

<KeybindSetting name="consoleKey" {disabled} {hidden} bind:busy />
