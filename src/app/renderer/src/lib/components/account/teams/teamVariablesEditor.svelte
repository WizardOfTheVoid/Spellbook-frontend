<script lang="ts">
  import { slugVariableLabel, variableErrors, type TeamVariable } from '@spellbook/shared/teamVariables'
  import Input from '$lib/components/ui/Input.svelte'
  import Button from '$lib/components/ui/Button.svelte'
  import PanelHeader from '$lib/components/ui/PanelHeader.svelte'

  export let variables: TeamVariable[] = []
  export let disabled = false
  export let onChange: (variables: TeamVariable[]) => void

  $: errors = variableErrors(variables)

  function change(index: number, update: Partial<TeamVariable>) {
    onChange(variables.map((variable, item) => item === index ? { ...variable, ...update } : variable))
  }
</script>

<section class="team-variables" aria-label="Team variables">
  <PanelHeader variant="section" title="Custom variables">
    <svelte:fragment slot="trailing"><Button label="Add variable" icon="fa-plus" {disabled} onClick={() => onChange([...variables, { label: ``, key: ``, value: `` }])} /></svelte:fragment>
  </PanelHeader>
  {#each variables as variable, index (index)}
    <div class="variable-row">
      <Input label="Name" value={variable.label} error={errors[index]} maxlength={64} placeholder="Rules URL" {disabled} onChange={label => change(index, { label, key: slugVariableLabel(label) })} />
      <Input label="Value" value={variable.value} maxlength={255} {disabled} onChange={value => change(index, { value })} />
      <Button label="Remove" variant="danger" {disabled} onClick={() => onChange(variables.filter((_, item) => item !== index))} />
      <small class:variable-error={errors[index]}>{errors[index] ?? `[${variable.key}]`}</small>
    </div>
  {:else}
    <small>No custom variables yet.</small>
  {/each}
  <small>Renaming a variable changes its tag. Messages using the old tag are not updated.</small>
</section>

<style lang="scss">
  .team-variables { min-width: 0; display: grid; gap: var(--gutter-lg); }
  .variable-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto; align-items: end; gap: var(--gutter-md); }
  small { color: var(--color-light-secondary); font-size: var(--font-size-xs); }
  .variable-row small { grid-column: 1 / -1; }
  .variable-error { color: var(--color-danger-primary); }
  @media (max-width: 600px) { .variable-row { grid-template-columns: minmax(0, 1fr); } }
</style>
