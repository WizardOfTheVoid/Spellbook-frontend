<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte'
  import Icon from '$lib/components/ui/Icon.svelte'
  import InfoNotice from '$lib/components/ui/infoNotice.svelte'

  export let reviewStatus: `candidate` | `wanted`
  export let onView: () => void
  export let onMore: () => void
  export let canView = true
</script>

<section class="submission-complete">
  <div class="submission-complete__thanks">
    <Icon name="fa-circle-check" size="lg" tone="var(--color-accent-primary)" />
    <h3>Thank you for submitting evidence</h3>
  </div>
  <InfoNotice
    message={reviewStatus === `candidate` ? `Sent for review. A Wanted reviewer can now inspect your evidence.` : `Evidence submitted. It is ready on the Wanted profile.`}
    icon={reviewStatus === `candidate` ? `fa-clock` : `fa-circle-check`}
    tone={reviewStatus === `candidate` ? `var(--color-accent-tertiary)` : `var(--color-accent-primary)`}
  />
  <div class="submission-complete__actions">
    <Button label="View evidence" icon="fa-eye" variant="primary" disabled={!canView} onClick={onView} />
    <Button label="Submit more evidence" onClick={onMore} />
  </div>
</section>

<style lang="scss">
  .submission-complete { display: grid; gap: var(--gutter-lg); }
  .submission-complete__thanks { display: flex; align-items: center; gap: var(--gutter-md); }
  h3 { margin: 0; font-size: var(--font-size-lg); }
  .submission-complete__actions { display: flex; flex-wrap: wrap; gap: var(--gutter-sm); }
</style>
