<script lang="ts">
  import Icon from '$lib/components/ui/Icon.svelte'
  export let logo: string | null | undefined = null
  export let fallback = `fa-users`
  let failed = false
  $: if (logo) failed = false
</script>

<span class="team-logo">
  {#if logo && !failed}<img src={logo} alt="" on:error={() => failed = true} />
  {:else}<Icon name={fallback} size="lg" />{/if}
</span>

<style>
  .team-logo { display: grid; place-items: center; width: 48px; height: 48px; flex-shrink: 0; color: var(--color-accent-primary); }
  img { width: 100%; height: 100%; object-fit: contain; }
</style>
